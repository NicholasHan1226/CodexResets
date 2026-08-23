import { runPipelineOnce } from './pipeline';
import type { Env, RunReport } from './types';

interface PipelineRequest {
  trigger?: unknown;
}

const ALLOWED_TRIGGERS = new Set(['cron', 'manual', 'x-webhook']);

/**
 * A single globally named coordinator makes the pipeline a single-writer
 * workflow without a database migration or a fragile distributed lease.
 */
export class PipelineCoordinator {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/run') return response({ error: 'not found' }, 404);

    let body: PipelineRequest;
    try {
      body = await request.json() as PipelineRequest;
    } catch {
      return response({ error: 'invalid json' }, 400);
    }
    if (typeof body.trigger !== 'string' || !ALLOWED_TRIGGERS.has(body.trigger)) {
      return response({ error: 'invalid trigger' }, 400);
    }

    const report = await this.state.blockConcurrencyWhile(() => runPipelineOnce(this.env, body.trigger as string));
    return response(report);
  }
}

function response(body: RunReport | { error: string }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

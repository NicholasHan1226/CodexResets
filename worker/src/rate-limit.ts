interface RateLimitRequest {
  limit?: unknown;
  windowSeconds?: unknown;
}

interface RateLimitWindow {
  startedAt: number;
  attempts: number;
}

/**
 * One object is addressed per scope and hashed client address. Durable Object
 * storage serializes each object's updates, so a quota cannot be bypassed by
 * racing the read and write as it could with eventually-consistent KV.
 */
export class RateLimiter {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return decision(false, 405);
    let body: RateLimitRequest;
    try {
      body = await request.json() as RateLimitRequest;
    } catch {
      return decision(false, 400);
    }

    const limit = Number(body.limit);
    const windowSeconds = Number(body.windowSeconds);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100
      || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86_400) {
      return decision(false, 400);
    }

    const now = Date.now();
    const existing = await this.state.storage.get<RateLimitWindow>('window');
    const current = !existing || now - existing.startedAt >= windowSeconds * 1000
      ? { startedAt: now, attempts: 0 }
      : existing;
    if (current.attempts >= limit) return decision(false, 429);

    current.attempts += 1;
    await this.state.storage.put('window', current);
    return decision(true, 200);
  }
}

function decision(allowed: boolean, status: number): Response {
  return new Response(JSON.stringify({ allowed }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

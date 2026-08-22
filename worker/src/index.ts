import type { Env } from './types';
import { corsHeaders, json } from './util';
import {
  handleSignals,
  handleHealth,
  handleSubscribePush,
  handleSubscribeEmail,
  handleConfirmEmail,
  handleUnsubscribePush,
  handleUnsubscribeEmail,
  handleResendWebhook,
  handleRun,
  handleTestEmail,
} from './routes';
import { runPipeline } from './pipeline';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      switch (path) {
        case '/':
        case '/api/health':
          return await handleHealth(env);
        case '/api/signals':
          return await handleSignals(env);
        case '/api/subscribe/push':
          if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
          return await handleSubscribePush(request, env);
        case '/api/subscribe/email':
          if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
          return await handleSubscribeEmail(request, env);
        case '/api/subscribe/confirm':
          if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
          return await handleConfirmEmail(url, env);
        case '/api/unsubscribe/push':
          if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
          return await handleUnsubscribePush(request, env);
        case '/api/unsubscribe':
          return await handleUnsubscribeEmail(url, env);
        case '/api/webhooks/resend':
          if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
          return await handleResendWebhook(request, env);
        case '/api/run':
          if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
          return await handleRun(request, env);
        case '/api/test-email':
          if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
          return await handleTestEmail(request, env);
        default:
          return json({ error: 'not found' }, 404);
      }
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'internal error' }, 500);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runPipeline(env, 'cron'));
  },
};

import type { Env } from './types';
import { corsHeaders, json } from './util';
import {
  handleSignals,
  handleHealth,
  handleReleaseStatus,
  handleHealthDetails,
  handleSubscribePush,
  handleSubscribeEmail,
  handleConfirmEmail,
  handleConfirmEmailPost,
  handleUnsubscribePush,
  handleUnsubscribeEmail,
  handleUnsubscribeEmailPost,
  handleResendWebhook,
  handleXWebhook,
  handleRun,
  handleTestEmail,
} from './routes';
import { runPipeline } from './pipeline';

export { RateLimiter } from './rate-limit';
export { ForecastLedger } from './forecast-ledger';
export { PipelineCoordinator } from './pipeline-coordinator';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
        case '/api/release-status':
          return await handleReleaseStatus(env);
        case '/api/health/details':
          return await handleHealthDetails(request, env);
        case '/api/signals':
          return await handleSignals(env);
        case '/api/subscribe/push':
          if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
          return await handleSubscribePush(request, env);
        case '/api/subscribe/email':
          if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
          return await handleSubscribeEmail(request, env);
        case '/api/subscribe/confirm':
          if (request.method === 'GET') return await handleConfirmEmail(url, env);
          if (request.method === 'POST') return await handleConfirmEmailPost(url, env);
          return json({ error: 'method not allowed' }, 405);
        case '/api/unsubscribe/push':
          if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
          return await handleUnsubscribePush(request, env);
        case '/api/unsubscribe':
          if (request.method === 'GET') return await handleUnsubscribeEmail(url, env);
          if (request.method === 'POST') return await handleUnsubscribeEmailPost(request, url, env);
          return json({ error: 'method not allowed' }, 405);
        case '/api/webhooks/resend':
          if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
          return await handleResendWebhook(request, env);
        case '/api/webhooks/x':
          if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
          return await handleXWebhook(request, url, env, ctx);
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
      console.error('Worker request failed', err);
      return json({ error: 'internal error' }, 500);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runPipeline(env, 'cron'));
  },
};

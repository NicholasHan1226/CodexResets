import { describe, expect, it } from 'vitest';
import { handleHealth, handleSignals } from '../worker/src/routes';
import type { Env } from '../worker/src/types';

function envWith(cacheEntries: Record<string, string | null>): Env {
  return {
    CACHE: {
      get: async (key: string) => cacheEntries[key] ?? null,
    },
  } as unknown as Env;
}

describe('pipeline read endpoints', () => {
  it('returns a cacheable signal snapshot with browser CORS enabled', async () => {
    const snapshot = JSON.stringify({ signals: [{ source: 'tibopost' }], generatedAt: 123 });
    const response = await handleSignals(envWith({ 'signals:latest': snapshot }));

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    await expect(response.json()).resolves.toEqual(JSON.parse(snapshot));
  });

  it('returns 503 until the first signal snapshot exists', async () => {
    const response = await handleSignals(envWith({}));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'no snapshot yet' });
  });

  it('reports configured delivery capabilities without exposing secret values', async () => {
    const response = await handleHealth(envWith({
      'health:last_run': JSON.stringify({ scrape: 'ok' }),
      'signals:latest': JSON.stringify({ generatedAt: 456 }),
    }));
    const body = await response.json() as {
      ok: boolean;
      signalsGeneratedAt: number;
      configured: { pipelineSecret: boolean; resend: boolean; vapid: boolean };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.signalsGeneratedAt).toBe(456);
    expect(body.configured).toMatchObject({ pipelineSecret: false, resend: false, vapid: false });
  });
});

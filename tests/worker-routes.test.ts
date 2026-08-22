import { describe, expect, it } from 'vitest';
import { handleHealth, handleSignals } from '../worker/src/routes';
import type { Env } from '../worker/src/types';
import { detectResetEvents } from '../worker/src/scrape';

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
    const now = new Date().toISOString();
    const response = await handleHealth(envWith({
      'health:last_run': JSON.stringify({ startedAt: now, scrape: 'ok', errors: [] }),
      'signals:latest': JSON.stringify({ generatedAt: Date.now() }),
    }));
    const body = await response.json() as {
      ok: boolean;
      signalsGeneratedAt: number;
      configured: { pipelineSecret: boolean; resend: boolean; vapid: boolean };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.configured).toMatchObject({ pipelineSecret: false, resend: false, vapid: false });
  });

  it('returns a failing health status when the cron report is stale or failed', async () => {
    const response = await handleHealth(envWith({
      'health:last_run': JSON.stringify({
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        scrape: 'failed',
        errors: ['scrape: unavailable'],
      }),
      'signals:latest': JSON.stringify({ generatedAt: Date.now() - 2 * 60 * 60 * 1000 }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      checks: { lastRun: 'failed', signals: 'stale' },
    });
  });

  it('keeps an explicit Codex reset notice strong and promotion noise weak', () => {
    const detection = detectResetEvents([
      { ts: 1, link: 'https://example.test/reset', text: 'The banked reset has landed for all paid Codex users.' },
      { ts: 2, link: 'https://example.test/launch', text: 'Codex has 20M active users. What a launch!' },
      { ts: 3, link: 'https://example.test/question', text: 'When do Codex usage limits reset?' },
    ]);

    expect(detection.strong.map((event) => event.link)).toEqual(['https://example.test/reset']);
    expect(detection.weak.map((event) => event.link)).toEqual(['https://example.test/question']);
  });
});

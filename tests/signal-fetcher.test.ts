import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPipelineSignals, getDashboardInputs, isCompletePipelineSnapshot, isFreshPipelineSnapshot, PIPELINE_SNAPSHOT_MAX_AGE_MS } from '../src/lib/signal-fetcher';

describe('pipeline snapshots', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('does not accept an expired or far-future Worker snapshot as live', () => {
    const now = Date.now();
    expect(isFreshPipelineSnapshot(now - PIPELINE_SNAPSHOT_MAX_AGE_MS + 1, now)).toBe(true);
    expect(isFreshPipelineSnapshot(now - PIPELINE_SNAPSHOT_MAX_AGE_MS - 1, now)).toBe(false);
    expect(isFreshPipelineSnapshot(now + 5 * 60 * 1000 + 1, now)).toBe(false);
  });

  it('requires all three independent Worker signal sources before presenting a snapshot as live', () => {
    const now = Date.now();
    const signals = [
      { source: 'tibopost', label: 'Tibo', description: 'signals.tiboUnavailable', status: 'idle' as const, value: 0.1, updatedAt: now },
      { source: 'status_page', label: 'Status', description: 'signals.statusClear', status: 'idle' as const, value: 0.08, updatedAt: now },
      { source: 'cooldown', label: 'Cooldown', description: 'signals.cooldownDesc', status: 'weak' as const, value: 0.6, updatedAt: now },
    ];
    expect(isCompletePipelineSnapshot({ generatedAt: now, signals }, now)).toBe(true);
    expect(isCompletePipelineSnapshot({ generatedAt: now, signals: signals.slice(0, 2) }, now)).toBe(false);
    expect(isCompletePipelineSnapshot({ generatedAt: now, signals: [...signals.slice(0, 2), { ...signals[2], source: 'cooldown', value: 2 }] }, now)).toBe(false);
    expect(isCompletePipelineSnapshot({
      generatedAt: now,
      signals,
      history: [{ id: 'future-reset', reset_date: new Date(now + 6 * 60 * 1000).toISOString(), verified: true }],
    }, now)).toBe(false);
  });

  it('revalidates a cached 89-minute snapshot when it crosses the 90-minute freshness limit', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_PIPELINE_API_URL', 'https://pipeline.example');
    const start = Date.UTC(2026, 8, 5, 8);
    const generatedAt = start - 89 * 60_000;
    let now = start;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const snapshot = {
      generatedAt,
      signals: ['tibopost', 'status_page', 'cooldown'].map((source) => ({
        source, label: source, description: 'signals.tiboUnavailable',
        status: 'idle', value: 0, updatedAt: generatedAt,
      })),
      history: [{ id: 'reset', reset_date: new Date(start - 7 * 86_400_000).toISOString(), verified: true }],
    };
    const fetch = vi.fn(async () => Response.json(snapshot));
    vi.stubGlobal('fetch', fetch);
    const { getDashboardInputs: readInputs } = await import('../src/lib/signal-fetcher');

    await expect(readInputs()).resolves.toMatchObject({ hasRealData: true, generatedAt });
    now += 30_000;
    await expect(readInputs()).resolves.toMatchObject({ hasRealData: true, generatedAt });
    expect(fetch).toHaveBeenCalledTimes(1);

    now = start + 2 * 60_000; // Browser cache has three minutes left; server inputs are stale.
    await expect(readInputs()).resolves.toMatchObject({ hasRealData: false, generatedAt: null });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('accepts an explicit force flag for a manual pipeline refresh', async () => {
    await expect(fetchPipelineSignals(true)).resolves.toBeNull();
  });

  it('does not substitute a local forecast when the production snapshot is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));

    await expect(getDashboardInputs()).resolves.toMatchObject({
      signals: null,
      hasRealData: false,
      generatedAt: null,
      records: null,
    });
  });
});

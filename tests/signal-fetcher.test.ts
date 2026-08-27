import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPipelineSignals, getDashboardInputs, isCompletePipelineSnapshot, isFreshPipelineSnapshot, PIPELINE_SNAPSHOT_MAX_AGE_MS } from '../src/lib/signal-fetcher';

describe('pipeline snapshots', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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

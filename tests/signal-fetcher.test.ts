import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOpenAIStatus, fetchPipelineSignals, fetchTiboTweets, isCompletePipelineSnapshot, isFreshPipelineSnapshot, PIPELINE_SNAPSHOT_MAX_AGE_MS } from '../src/lib/signal-fetcher';

describe('browser signal fallbacks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the Worker-compatible source ID for Tibo posts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 'ok',
      items: [{
        title: 'No reset notice yet',
        description: 'No reset notice yet',
        pubDate: new Date().toISOString(),
      }],
    }), { status: 200 })));

    await expect(fetchTiboTweets()).resolves.toMatchObject({
      source: 'tibopost',
      label: 'Tibo Posting',
    });
  });

  it('uses the Worker-compatible source ID for OpenAI status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ incidents: [] }), { status: 200 })));

    await expect(fetchOpenAIStatus()).resolves.toMatchObject({
      source: 'status_page',
      label: 'OpenAI Status',
    });
  });

  it('does not accept an expired or far-future Worker snapshot as live', () => {
    const now = Date.now();
    expect(isFreshPipelineSnapshot(now - PIPELINE_SNAPSHOT_MAX_AGE_MS + 1, now)).toBe(true);
    expect(isFreshPipelineSnapshot(now - PIPELINE_SNAPSHOT_MAX_AGE_MS - 1, now)).toBe(false);
    expect(isFreshPipelineSnapshot(now + 5 * 60 * 1000 + 1, now)).toBe(false);
  });

  it('requires all canonical Worker signal sources before presenting a snapshot as live', () => {
    const now = Date.now();
    const signals = [
      { source: 'tibopost', label: 'Tibo', description: 'signals.tiboUnavailable', status: 'idle' as const, value: 0.1, updatedAt: now },
      { source: 'status_page', label: 'Status', description: 'signals.statusClear', status: 'idle' as const, value: 0.08, updatedAt: now },
      { source: 'cooldown', label: 'Cooldown', description: 'signals.cooldownDesc', status: 'weak' as const, value: 0.6, updatedAt: now },
      { source: 'launch_noise', label: 'Launch', description: 'signals.launchQuiet', status: 'idle' as const, value: 0.08, updatedAt: now },
    ];
    expect(isCompletePipelineSnapshot({ generatedAt: now, signals }, now)).toBe(true);
    expect(isCompletePipelineSnapshot({ generatedAt: now, signals: signals.slice(0, 3) }, now)).toBe(false);
    expect(isCompletePipelineSnapshot({ generatedAt: now, signals: [...signals.slice(0, 3), { ...signals[3], source: 'cooldown', value: 2 }] }, now)).toBe(false);
  });

  it('accepts an explicit force flag for a manual pipeline refresh', async () => {
    await expect(fetchPipelineSignals(true)).resolves.toBeNull();
  });
});

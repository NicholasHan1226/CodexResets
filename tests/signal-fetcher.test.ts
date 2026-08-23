import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOpenAIStatus, fetchTiboTweets } from '../src/lib/signal-fetcher';

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
});

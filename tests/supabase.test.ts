import { describe, expect, it, vi } from 'vitest';
import { sb } from '../worker/src/supabase';
import type { Env } from '../worker/src/types';

const env = {
  SUPABASE_URL: 'https://db.example.test',
  SUPABASE_ANON_KEY: 'anon-test-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
} as Env;

describe('Supabase Worker boundary', () => {
  it('bounds database requests and preserves an explicit caller signal', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await sb(env, 'reset_records?select=id');
      const defaultInit = fetchMock.mock.calls[0][1] as RequestInit;
      expect(defaultInit.signal).toBeInstanceOf(AbortSignal);

      const controller = new AbortController();
      await sb(env, 'reset_records?select=id', { signal: controller.signal }, true);
      const explicitInit = fetchMock.mock.calls[1][1] as RequestInit;
      expect(explicitInit.signal).toBe(controller.signal);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

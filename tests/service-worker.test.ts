import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type PushHandler = (event: {
  data: { json: () => unknown };
  waitUntil: (promise: Promise<unknown>) => void;
}) => void;

function loadPushHandler(showNotification: ReturnType<typeof vi.fn>): PushHandler {
  const handlers = new Map<string, unknown>();
  const self = {
    addEventListener: (name: string, handler: unknown) => handlers.set(name, handler),
    registration: { showNotification },
  };
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
  vm.runInNewContext(source, { self });
  return handlers.get('push') as PushHandler;
}

describe('push service worker', () => {
  it('labels an official-evidence jump truthfully', async () => {
    const showNotification = vi.fn(async () => undefined);
    const handlePush = loadPushHandler(showNotification);
    const pending: Promise<unknown>[] = [];

    handlePush({
      data: {
        json: () => ({
          title: 'Codex Reset Alert',
          body: 'Confirmed',
          url: 'https://x.com/thsottiaux/status/123',
          actionTitle: 'View official announcement / 查看官方公告',
        }),
      },
      waitUntil: (promise) => pending.push(promise),
    });
    await Promise.all(pending);

    expect(showNotification).toHaveBeenCalledWith('Codex Reset Alert', expect.objectContaining({
      data: expect.objectContaining({ url: 'https://x.com/thsottiaux/status/123' }),
      actions: expect.arrayContaining([
        expect.objectContaining({ action: 'view', title: 'View official announcement / 查看官方公告' }),
      ]),
    }));
  });
});

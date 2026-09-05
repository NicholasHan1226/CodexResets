import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { subscribeEmail } from '../src/lib/subscription';
import { emailLocale, type EmailLocale } from '../worker/src/email-template';
import { notifyAll } from '../worker/src/notify';
import { privActivateEmail } from '../worker/src/privileged';
import { handleSubscribeEmail, handleConfirmEmail, handleConfirmEmailPost, handleUnsubscribeEmail, handleUnsubscribeEmailPost, handleTestEmail } from '../worker/src/routes';
import type { Env } from '../worker/src/types';

// Isolated opt-in fixtures: no real recipient, database, mail or token is used.
function setup() {
  const cache = new Map<string, string>();
  const mails: Array<{ subject: string; html: string; text: string; to: string[]; headers?: Record<string, string> }> = [];
  const rows: Array<{ email: string; locale?: EmailLocale }> = [];
  const writes: unknown[] = [];
  const deletes: string[] = [];
  const env = {
    SITE_URL: 'https://codexresets.cc', SUPABASE_URL: 'https://db.example.test',
    RESEND_FROM: 'alerts@example.test', RESEND_API_KEY: 'test-only',
    SUPABASE_SERVICE_ROLE_KEY: 'test-only', UNSUBSCRIBE_SECRET: 'test-only',
    CRON_SECRET: 'test-only', TURNSTILE_SECRET: 'test-only',
    CACHE: {
      get: async (key: string) => cache.get(key) ?? null,
      put: async (key: string, value: string) => { cache.set(key, value); },
      delete: async (key: string) => { cache.delete(key); },
    },
    RATE_LIMITER: { idFromName: () => 'fixture', get: () => ({ fetch: async () => Response.json({ allowed: true }) }) },
  } as unknown as Env;
  let activationFails = false;
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return Response.json({ success: true, hostname: 'codexresets.cc', action: 'subscribe_email' });
    if (url === 'https://api.resend.com/emails') {
      mails.push(JSON.parse(String(init?.body)));
      return Response.json({ id: 'fixture-only' });
    }
    if (url === 'https://db.example.test/rest/v1/subscriptions?on_conflict=email' && init?.method === 'POST') {
      if (activationFails) return new Response('', { status: 503 });
      const body = JSON.parse(String(init.body));
      writes.push(body);
      rows.push(...body);
      return new Response(null, { status: 201 });
    }
    if (url.startsWith('https://db.example.test/rest/v1/subscriptions?select=email,locale&is_active=eq.true&order=email.asc&limit=500&email=gt.')) return Response.json([]);
    if (url === 'https://db.example.test/rest/v1/subscriptions?select=email,locale&is_active=eq.true&order=email.asc&limit=500') return Response.json(rows);
    if (url.startsWith('https://db.example.test/rest/v1/push_subscriptions?select=endpoint,p256dh,auth&order=endpoint.asc&limit=500&endpoint=gt.')) return Response.json([]);
    if (url === 'https://db.example.test/rest/v1/push_subscriptions?select=endpoint,p256dh,auth&order=endpoint.asc&limit=500') return Response.json([]);
    if (url.startsWith('https://db.example.test/rest/v1/subscriptions?email=eq.') && init?.method === 'DELETE') {
      deletes.push(url);
      return new Response(null, { status: 204 });
    }
    throw new Error('Unmocked request: ' + url);
  });
  vi.stubGlobal('fetch', mock);
  return { env, cache, mails, rows, writes, deletes, mock, failActivation: () => { activationFails = true; } };
}

function requestSubscription(locale: unknown) {
  return new Request('https://codexresets.cc/api/subscribe/email', {
    method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.17' },
    body: JSON.stringify({ email: 'reader@example.test', turnstileToken: 'fixture-only', ...(locale == null ? {} : { locale }) }),
  });
}

async function preview(name: string, content: string) {
  if (process.env.CODEX_EMAIL_PREVIEW_DIR) await writeFile(join(process.env.CODEX_EMAIL_PREVIEW_DIR, name + '.html'), content);
}

afterEach(() => vi.unstubAllGlobals());

describe('subscription language continuity', () => {
  it.each(['zh', 'en'] as const)('passes the selected website language %s to subscription intake', async (locale) => {
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/api/subscribe/email');
      expect(init?.method).toBe('POST');
      return Response.json({ status: 'pending' });
    });
    vi.stubGlobal('fetch', mock);
    expect(await subscribeEmail(' READER@example.test ', 'fixture-only', locale)).toBe('pending');
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ email: 'reader@example.test', turnstileToken: 'fixture-only', locale });
  });

  it.each(['zh', 'en', null] as const)('preserves %s across opt-in, stored recipient, alert and unsubscribe', async (locale) => {
    const s = setup();
    expect((await handleSubscribeEmail(requestSubscription(locale), s.env)).status).toBe(200);
    expect(s.writes).toHaveLength(0);
    expect(s.mails).toHaveLength(1);
    const entry = [...s.cache].find(([key]) => key.startsWith('subscribe:confirm:'))!;
    expect(JSON.parse(entry[1])).toEqual({ email: 'reader@example.test', ...(locale ? { locale } : {}) });
    const token = entry[0].slice('subscribe:confirm:'.length);
    // A modified presentation query cannot override the language stored at opt-in.
    const url = new URL(`https://codexresets.cc/api/subscribe/confirm?t=${token}&lang=${locale === 'en' ? 'zh' : 'en'}`);
    const page = await handleConfirmEmail(url, s.env);
    const pageHtml = await page.text();
    expect(page.status).toBe(200);
    expect(pageHtml).toContain('method="post"');
    expect(pageHtml).toContain('lang="' + (locale === 'en' ? 'en' : 'zh-CN') + '"');
    if (locale === 'en') expect(pageHtml).not.toMatch(/[\u3400-\u9fff]/);
    if (locale === 'zh') expect(pageHtml).not.toContain('Confirm subscription');
    expect(s.writes).toHaveLength(0);
    const confirmed = await handleConfirmEmailPost(url, s.env);
    expect(confirmed.status).toBe(200);
    const receipt = await confirmed.text();
    expect(s.writes).toEqual([[{ email: 'reader@example.test', is_active: true, unsubscribed_at: null, ...(locale ? { locale } : {}) }]]);
    expect(s.cache.has(entry[0])).toBe(false);
    await preview(`confirm-page-${locale || 'bilingual'}`, pageHtml);
    await preview(`confirmed-page-${locale || 'bilingual'}`, receipt);

    const result = await notifyAll(s.env, { id: 'fixture-event', ts: Date.now(), text: 'We reset Codex limits for all paid users.', link: '' });
    expect(result).toMatchObject({ emails: 1, errors: [] });
    const mail = s.mails[1];
    if (locale === 'en') expect(mail.subject + mail.html + mail.text).not.toMatch(/[\u3400-\u9fff]/);
    if (locale === 'zh') expect(mail.html).not.toContain('lang="en"');
    const unsubscribe = new URL(mail.headers!['List-Unsubscribe'].slice(1, -1));
    expect(unsubscribe.searchParams.get('lang')).toBe(locale);
    const stopPage = await handleUnsubscribeEmail(unsubscribe, s.env);
    const stopHtml = await stopPage.text();
    expect(stopPage.status).toBe(200);
    expect(s.deletes).toHaveLength(0);
    const stop = await handleUnsubscribeEmailPost(new Request(unsubscribe, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'source=browser' }), unsubscribe, s.env);
    expect(stop.status).toBe(200);
    const stopReceipt = await stop.text();
    expect(s.deletes).toHaveLength(1);
    for (const html of [stopHtml, stopReceipt, receipt]) {
      if (locale === 'en') expect(html).not.toMatch(/[\u3400-\u9fff]/);
      if (locale === 'zh') expect(html).not.toContain('Back to dashboard');
      if (locale === null) expect(html).toContain('Back to dashboard');
    }
    await preview(`unsubscribe-page-${locale || 'bilingual'}`, stopHtml);
    await preview(`unsubscribed-page-${locale || 'bilingual'}`, stopReceipt);
    const oneClick = await handleUnsubscribeEmailPost(new Request(unsubscribe, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }), unsubscribe, s.env);
    expect(oneClick.status).toBe(200);
    expect(await oneClick.text()).toBe('');
    expect(s.mails).toHaveLength(2);
  });

  it.each(['fr', '<script>', 123, {}, ['en']])('rejects unsupported locale %j without sending mail', async (locale) => {
    const s = setup();
    expect((await handleSubscribeEmail(requestSubscription(locale), s.env)).status).toBe(400);
    expect((await handleTestEmail(new Request('https://codexresets.cc/api/test-email', { method: 'POST', headers: { authorization: 'Bearer test-only' }, body: JSON.stringify({ email: 'reader@example.test', locale }) }), s.env)).status).toBe(400);
    expect(s.mock).not.toHaveBeenCalled();
    expect(emailLocale(locale)).toBe(null);
  });

  it('keeps pending language after an activation failure and never clears preference for old tokens', async () => {
    const s = setup();
    await privActivateEmail(s.env, 'reader@example.test');
    expect(s.writes).toEqual([[{ email: 'reader@example.test', is_active: true, unsubscribed_at: null }]]);
    await handleSubscribeEmail(requestSubscription('zh'), s.env);
    const entry = [...s.cache].find(([key]) => key.startsWith('subscribe:confirm:'))!;
    s.failActivation();
    const response = await handleConfirmEmailPost(new URL('https://codexresets.cc/api/subscribe/confirm?t=' + entry[0].slice('subscribe:confirm:'.length)), s.env);
    expect(response.status).toBe(502);
    expect(await response.text()).toContain('暂时无法激活订阅');
    expect(JSON.parse(s.cache.get(entry[0])!).locale).toBe('zh');
  });

  it('localizes expired and invalid links without treating language as authorization', async () => {
    const s = setup();
    const invalid = new URL('https://codexresets.cc/api/unsubscribe?lang=zh');
    const page = await handleUnsubscribeEmail(invalid, s.env);
    expect(page.status).toBe(400);
    expect(await page.text()).toContain('退订链接无效或已过期');
    const stop = await handleUnsubscribeEmailPost(new Request(invalid, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'source=browser' }), invalid, s.env);
    expect(stop.status).toBe(400);
    expect(await stop.text()).toContain('退订链接无效或已过期');
    const expired = await handleConfirmEmail(new URL('https://codexresets.cc/api/subscribe/confirm?t=01234567-89ab-cdef-0123-456789abcdef&lang=en'), s.env);
    expect(expired.status).toBe(410);
    const content = await expired.text();
    expect(content).toContain('This confirmation link has expired.');
    expect(content).not.toMatch(/[\u3400-\u9fff]/);
    expect(s.mock).not.toHaveBeenCalled();
  });

  it('does not mix languages between concurrent recipients', async () => {
    const s = setup();
    s.rows.push({ email: 'english@example.test', locale: 'en' }, { email: 'chinese@example.test', locale: 'zh' }, { email: 'legacy@example.test', locale: null });
    expect(await notifyAll(s.env, { id: 'mixed-locale', ts: Date.now(), text: 'We reset Codex limits for all paid users.', link: '' })).toMatchObject({ emails: 3, errors: [] });
    const english = s.mails.find(mail => mail.to[0] === 'english@example.test')!;
    const chinese = s.mails.find(mail => mail.to[0] === 'chinese@example.test')!;
    const legacy = s.mails.find(mail => mail.to[0] === 'legacy@example.test')!;
    expect(english.html + english.text + english.subject).not.toMatch(/[\u3400-\u9fff]/);
    expect(chinese.html).toContain('已确认');
    expect(chinese.html).not.toContain('lang="en"');
    expect(legacy.html).toContain('lang="en"');
    expect(legacy.html).toContain('已确认');
  });
});

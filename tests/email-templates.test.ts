import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderEmail, type EmailLocale } from '../worker/src/email-template';
import { buildTestEmail, notifyAll, notifyForecastPrealert, notifyScheduledExecution, sendCalibrationAlert, sendHealthAlert, sendSubscriptionConfirmation, sendTestEmail } from '../worker/src/notify';
import { handleTestEmail } from '../worker/src/routes';
import type { Env } from '../worker/src/types';

// Local preview/test fixtures only. All outgoing calls are intercepted below.
const env = {
  SITE_URL: 'https://codexresets.cc', RESEND_FROM: 'Codex Resets <alerts@example.test>',
  RESEND_API_KEY: 'test-only', UNSUBSCRIBE_SECRET: 'test-only', CRON_SECRET: 'test-only',
  SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only',
  HEALTH_ALERT_EMAIL: 'ops@example.test',
} as Env;
const at = Date.parse('2026-08-30T12:00:00Z');
const evidence = 'https://x.com/thsottiaux/status/123456789';
type Mail = { subject: string; html: string; text: string; to: string[]; headers?: Record<string, string> };

function captureMail(locale: EmailLocale = null) {
  const messages: Mail[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://api.resend.com/emails') {
      messages.push(JSON.parse(String(init?.body)) as Mail);
      return Response.json({ id: 'local-preview-only' });
    }
    if (url.startsWith('https://db.example.test/rest/v1/subscriptions?select=email,locale&is_active=eq.true&order=email.asc&limit=500&email=gt.')) return Response.json([]);
    if (url === 'https://db.example.test/rest/v1/subscriptions?select=email,locale&is_active=eq.true&order=email.asc&limit=500') return Response.json([{ email: 'reader@example.test', locale }]);
    if (url.startsWith('https://db.example.test/rest/v1/push_subscriptions?select=endpoint,p256dh,auth&order=endpoint.asc&limit=500&endpoint=gt.')) return Response.json([]);
    if (url === 'https://db.example.test/rest/v1/push_subscriptions?select=endpoint,p256dh,auth&order=endpoint.asc&limit=500') return Response.json([]);
    throw new Error('Unmocked request: ' + url);
  });
  vi.stubGlobal('fetch', mock);
  return { messages, mock };
}

afterEach(() => vi.unstubAllGlobals());

describe('branded email presentation', () => {
  it.each(['zh', 'en', null] as const)('renders subscriber messages, subjects and test previews in %s', async (locale) => {
    const { messages } = captureMail(locale);
    await sendTestEmail(env, 'reader@example.test', locale);
    await sendSubscriptionConfirmation(env, 'reader@example.test', 'fixture-only', locale);
    await notifyAll(env, { id: 'locale-reset', ts: at, text: 'The banked reset has landed for all paid Codex users.', link: evidence });
    await notifyForecastPrealert(env, { id: 'locale-forecast', evaluatedAt: at, planningProbability: 0.85, modelProbability: 0.42, officialEvidenceUrl: evidence });
    await notifyScheduledExecution(env, { id: 'locale-scheduled', scheduledAt: at, officialEvidenceUrl: evidence });
    expect(messages).toHaveLength(5);
    const names = ['test', 'confirmation', 'reset', 'forecast', 'scheduled'];
    for (const [index, mail] of messages.entries()) {
      expect(mail.html).toContain(`lang="${locale === 'en' ? 'en' : 'zh-CN'}"`);
      if (locale === 'en') {
        expect(mail.subject + mail.html + mail.text).not.toMatch(/[\u3400-\u9fff]/);
      } else if (locale === 'zh') {
        expect(mail.subject).toMatch(/[\u3400-\u9fff]/);
        expect(mail.html).not.toContain('lang="en"');
        expect(mail.text).not.toMatch(/Open dashboard|Confirm subscription|Historical model|Unsubscribe|Planning likelihood|Scheduled time/);
      } else {
        expect(mail.subject).toMatch(/[\u3400-\u9fff]/);
        expect(mail.html).toContain('lang="en"');
      }
      if (index >= 2) {
        const url = new URL(mail.headers!['List-Unsubscribe'].slice(1, -1));
        expect(url.searchParams.get('lang')).toBe(locale);
        expect(mail.text).toContain(url.href);
      }
      if (process.env.CODEX_EMAIL_PREVIEW_DIR) {
        await writeFile(join(process.env.CODEX_EMAIL_PREVIEW_DIR, `${names[index]}-${locale || 'bilingual'}.html`), mail.html);
      }
    }
    expect(messages[0]).toMatchObject(buildTestEmail(env, locale));
    expect(messages[1].html).toContain('api/subscribe/confirm?t=fixture-only' + (locale ? `&amp;lang=${locale}` : ''));
    expect(messages[2].text).toContain('Asia/Shanghai (UTC+8)');
    expect(messages[3].text).toContain('85%');
    expect(messages[3].text).toContain('42%');
  });

  it('uses the same HTML and text renderer for all seven actual sending paths', async () => {
    const { messages } = captureMail();
    await sendTestEmail(env, 'reader@example.test');
    await sendSubscriptionConfirmation(env, 'reader@example.test', 'preview-only-not-a-real-token');
    expect(await notifyAll(env, { id: 'preview-reset', ts: at, text: 'The banked reset has landed for all paid Codex users.', link: evidence })).toMatchObject({ emails: 1, errors: [] });
    expect(await notifyForecastPrealert(env, { id: 'preview-forecast', evaluatedAt: at, planningProbability: 0.85, modelProbability: 0.42, officialEvidenceUrl: evidence })).toMatchObject({ emails: 1, errors: [] });
    expect(await notifyScheduledExecution(env, { id: 'preview-scheduled', scheduledAt: at, officialEvidenceUrl: evidence })).toMatchObject({ emails: 1, errors: [] });
    await sendHealthAlert(env, { startedAt: new Date(at).toISOString(), trigger: 'test', scrape: 'failed', tweetsSeen: 0, candidates: 0, inserted: 0, notifiedEmails: 0, notifiedPush: 0, errors: ['Preview diagnostic: source unavailable'] });
    await sendCalibrationAlert(env, {
      samples: 7, brier24h: null, brier48h: null, modelCounts: { logistic: 0, weibull: 7 }, latest: null,
      stage: 'provisional', nextReviewAt: 14, recentBrier: null, previousBrier: null, trend: 'unknown',
      decisionAccuracy48h: { threshold: 0.8, target: 0.8, decisions: 0, correct: 0, accuracy: null, positivePredictions: 0, positiveCorrect: 0, positivePrecision: null, status: 'collecting' },
    });
    const names = ['test', 'confirmation', 'reset', 'forecast', 'scheduled', 'health', 'calibration'];
    expect(messages).toHaveLength(names.length);
    for (const [index, mail] of messages.entries()) {
      expect(mail.html).toContain('max-width:560px');
      expect(mail.html).toContain('role="presentation"');
      expect(mail.html).toContain('name="viewport"');
      expect(mail.html).toContain('codex resets');
      expect(mail.html).toContain('lang="en"');
      expect(mail.html).not.toMatch(/<script|<img|<link|@import|url\(/i);
      expect(mail.html).not.toContain('undefined');
      expect(mail.text).toContain('Codex Resets');
      expect(mail.text).not.toMatch(/<html|&amp;|<table/);
      expect(mail.to).toHaveLength(1);
      expect(Buffer.byteLength(mail.html)).toBeLessThan(24 * 1024);
      // Optional local build artifacts; never published or sent. Directory
      // must already exist, so an explicit preview run controls the target.
      if (process.env.CODEX_EMAIL_PREVIEW_DIR) {
        await writeFile(join(process.env.CODEX_EMAIL_PREVIEW_DIR, names[index] + '.html'), mail.html);
        await writeFile(join(process.env.CODEX_EMAIL_PREVIEW_DIR, names[index] + '.txt'), mail.text);
      }
    }
    expect(messages[0]).toMatchObject(buildTestEmail(env));
    expect(messages[0].text).toContain('does not indicate a Codex reset');
    expect(messages[1].text).toContain('expires in 24 hours');
    expect(messages[2].text).toContain('Banked reset');
    expect(messages[2].text).toContain('Asia/Shanghai (UTC+8)');
    expect(messages[3].text).toContain('85%');
    expect(messages[3].text).toContain('42%');
    expect(messages[3].text).toContain('not a confirmed reset');
    expect(messages[4].text).toContain('not a separate confirmation post');
    expect(messages[4].text).toContain('2026-08-30 20:00');
    for (const mail of messages.slice(2, 5)) {
      expect(mail.text).toContain(evidence);
      expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
      const unsubUrl = mail.headers!['List-Unsubscribe'].slice(1, -1);
      expect(new URL(unsubUrl).searchParams.get('t')).toBeTruthy();
      expect(mail.text).toContain(unsubUrl);
      expect(mail.html).toContain(unsubUrl.replaceAll('&', '&amp;'));
    }
    for (const index of [0, 1, 5, 6]) expect(messages[index].html).not.toContain('api/unsubscribe');
  });

  it('uses the exact reusable test payload through the protected route without extra reads or sends', async () => {
    const { messages, mock } = captureMail();
    expect((await handleTestEmail(new Request('https://codexresets.cc/api/test-email', { method: 'POST', body: JSON.stringify({ email: 'reader@example.test' }) }), env)).status).toBe(401);
    expect(mock).not.toHaveBeenCalled();
    const result = await handleTestEmail(new Request('https://codexresets.cc/api/test-email', {
      method: 'POST', headers: { authorization: 'Bearer test-only' }, body: JSON.stringify({ email: 'reader@example.test' }),
    }), env);
    expect(result.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(messages[0]).toEqual({ from: env.RESEND_FROM, to: ['reader@example.test'], ...buildTestEmail(env) });
  });

  it('escapes source excerpts and signed URLs while preserving readable plain text', () => {
    const message = renderEmail({
      category: 'TEST', title: { zh: '<img src=x>', en: 'A & B' }, intro: { zh: '说明', en: 'Description' },
      details: [{ label: '时间', value: '<script>alert(1)</script>' }],
      evidence: { url: 'https://example.test/?a=1&b=2', excerpt: '"<img onerror=alert(1)>"' },
      action: { label: { zh: '打开', en: 'Open' }, url: 'https://example.test/?t="&x=1' },
    });
    expect(message.html).not.toMatch(/<img|<script/);
    expect(message.html).toContain('&lt;img');
    expect(message.html).toContain('a=1&amp;b=2');
    expect(message.html).toContain('t=&quot;&amp;x=1');
    expect(message.text).toContain('A & B');
    expect(message.text).toContain('https://example.test/?a=1&b=2');
  });

  it('keeps template output deterministic across retry times', () => {
    const first = buildTestEmail(env);
    vi.spyOn(Date, 'now').mockReturnValue(at + 86400000);
    try { expect(buildTestEmail(env)).toEqual(first); } finally { vi.restoreAllMocks(); }
  });
});

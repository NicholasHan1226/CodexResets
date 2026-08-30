import { escapeHtml } from './util';

export interface EmailContent { html: string; text: string }
export interface Copy { zh: string; en: string }
export type EmailLocale = 'zh' | 'en' | null;

/** Missing or unsupported preferences retain the legacy bilingual presentation. */
export function emailLocale(value: unknown): EmailLocale {
  return value === 'zh' || value === 'en' ? value : null;
}

export function emailCopy(copy: Copy, locale: EmailLocale, separator = ' / '): string {
  return locale ? copy[locale] : `${copy.zh}${separator}${copy.en}`;
}

/** Language is presentation-only; never part of subscription authorization. */
export function emailLanguageQuery(locale: EmailLocale): string {
  return locale ? `&lang=${locale}` : '';
}

interface EmailTemplate {
  category: string | Copy;
  title: Copy;
  intro: Copy;
  highlight?: { value: string; label: Copy };
  details?: Array<{ label: string | Copy; value: string | Copy }>;
  note?: Copy;
  evidence?: { url: string; excerpt?: string | null };
  action: { label: Copy; url: string };
  footer?: Copy;
  unsubscribeUrl?: string;
}

const FONT = "Arial,'PingFang SC','Microsoft YaHei',sans-serif";
const MONO = "'Courier New',monospace";

/** One presentation-only renderer for every mail, including delivery tests.
 * Inline styles and presentation tables remain readable without remote assets
 * or head CSS. No clock, randomness or IO: retries produce identical bodies.
 */
export function renderEmail(message: EmailTemplate, locale: EmailLocale = null): EmailContent {
  const e = escapeHtml;
  const pick = (copy: string | Copy) => typeof copy === 'string' ? copy : emailCopy(copy, locale);
  const paired = (copy: Copy) => locale ? e(copy[locale]) : `${e(copy.zh)}<br><span lang="en">${e(copy.en)}</span>`;
  const paragraphs = (copy: Copy) => locale
    ? `<p style="margin:0 0 24px;font-size:16px;line-height:1.8;color:#303d38">${e(copy[locale])}</p>`
    : `<p style="margin:0 0 7px;font-size:16px;line-height:1.8;color:#303d38">${e(copy.zh)}</p><p lang="en" style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#63716b">${e(copy.en)}</p>`;
  const highlight = message.highlight
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border-collapse:collapse"><tr><td style="padding:22px 24px;background:#eef7f3;border-left:3px solid #128161"><p class="metric" style="margin:0 0 8px;font-family:${MONO};font-size:60px;font-weight:700;line-height:1.1;letter-spacing:-3px;color:#096247">${e(message.highlight.value)}</p><p style="margin:0;font-size:14px;line-height:1.6;color:#245846">${paired(message.highlight.label)}</p></td></tr></table>`
    : '';
  const details = message.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-collapse:collapse">${message.details.map((detail) => `<tr><td style="padding:12px 0;border-bottom:1px solid #e7ece9"><p style="margin:0 0 5px;font-size:12px;line-height:1.6;color:#63716b">${e(pick(detail.label))}</p><p style="margin:0;font-size:14px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;color:#20372d">${e(pick(detail.value))}</p></td></tr>`).join('')}</table>`
    : '';
  const evidence = message.evidence
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 26px;border-collapse:collapse"><tr><td style="padding:0 0 0 16px;border-left:2px solid #cbdcd3">${message.evidence.excerpt ? `<p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#52645b">${e(message.evidence.excerpt)}</p>` : ''}<a href="${e(message.evidence.url)}" style="font-size:13px;line-height:1.8;color:#087054;text-decoration:underline">${pick({ zh: '查看官方公告', en: 'View official announcement' })}</a></td></tr></table>`
    : '';
  const footer = message.footer ?? { zh: '你收到此邮件，是因为订阅了 Codex Resets 提醒。', en: 'You subscribed at codexresets.cc.' };
  const html = `<!doctype html>
<html lang="${locale === 'en' ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${e(message.title[locale || 'zh'])} · Codex Resets</title>
<style>@media screen and (max-width:480px){.outer{padding:16px 8px!important}.inset{padding-left:22px!important;padding-right:22px!important}.headline{font-size:26px!important}.metric{font-size:52px!important}}a:focus-visible{outline:2px solid #128161;outline-offset:4px}</style></head>
<body style="margin:0;padding:0;background:#f0f3f1;font-family:${FONT};-webkit-text-size-adjust:100%;color:#17281f">
<div aria-hidden="true" style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${e(message.intro[locale || 'zh'])}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f3f1" style="border-collapse:collapse"><tr><td class="outer" align="center" style="padding:36px 16px">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:560px;table-layout:fixed;border-collapse:collapse;text-align:left;overflow-wrap:anywhere;word-break:break-word">
<tr><td class="inset" bgcolor="#10251d" style="padding:24px 34px;border-top:4px solid #20b486"><p style="margin:0;font-family:${MONO};font-size:19px;font-weight:700;letter-spacing:-0.5px;line-height:1.5;color:#ffffff"><span style="color:#51d8b0">❯</span> codex resets</p><p style="margin:5px 0 0;font-family:${MONO};font-size:11px;letter-spacing:1px;line-height:1.5;color:#b6d2c5">${e(typeof message.category === 'string' ? message.category : message.category[locale || 'en'])}</p></td></tr>
<tr><td class="inset" style="padding:32px 34px 34px">
<h1 class="headline" style="margin:0 0 ${locale ? '28' : '8'}px;font-size:30px;font-weight:700;line-height:1.35;letter-spacing:-0.5px;color:#17281f">${e(message.title[locale || 'zh'])}</h1>
${locale ? '' : `<p lang="en" style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#63716b">${e(message.title.en)}</p>`}
${highlight}${paragraphs(message.intro)}${details}${message.note ? paragraphs(message.note) : ''}${evidence}
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:100%"><tr><td bgcolor="#087054" style="border-radius:4px;text-align:center;mso-padding-alt:14px 24px"><a href="${e(message.action.url)}" style="display:inline-block;padding:14px 24px;border:1px solid #087054;border-radius:4px;font-size:15px;font-weight:700;line-height:1.5;color:#ffffff;text-decoration:none">${e(message.action.label[locale || 'zh'])}${locale ? '' : `<span lang="en" style="display:block;font-size:12px;font-weight:400">${e(message.action.label.en)}</span>`}</a></td></tr></table>
</td></tr>
<tr><td class="inset" style="padding:22px 34px;border-top:1px solid #e7ece9"><p style="margin:0 0 5px;font-size:12px;line-height:1.7;color:#63716b">${paired(footer)}</p>${message.unsubscribeUrl ? `<p style="margin:10px 0 0;font-size:12px;line-height:1.8"><a href="${e(message.unsubscribeUrl)}" style="color:#52645b;text-decoration:underline">${pick({ zh: '退订提醒', en: 'Unsubscribe' })}</a></p>` : ''}<p style="margin:12px 0 0;font-family:${MONO};font-size:11px;line-height:1.6;color:#63716b">codexresets.cc</p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  const copyText = (copy: Copy) => emailCopy(copy, locale, '\n');
  const text = [
    `Codex Resets · ${typeof message.category === 'string' ? message.category : message.category[locale || 'en']}`, copyText(message.title),
    message.highlight ? `${message.highlight.value}\n${copyText(message.highlight.label)}` : '',
    copyText(message.intro),
    ...(message.details ?? []).map((detail) => `${pick(detail.label)}\n${pick(detail.value)}`),
    message.note ? copyText(message.note) : '',
    message.evidence ? [message.evidence.excerpt, `${pick({ zh: '查看官方公告', en: 'View official announcement' })}: ${message.evidence.url}`].filter(Boolean).join('\n') : '',
    `${copyText(message.action.label)}\n${message.action.url}`, copyText(footer),
    message.unsubscribeUrl ? `${pick({ zh: '退订提醒', en: 'Unsubscribe' })}: ${message.unsubscribeUrl}` : '', 'codexresets.cc',
  ].filter(Boolean).join('\n\n');
  return { html, text };
}

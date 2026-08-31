import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('search entry contracts', () => {
  it('keeps the homepage search intent and no-JavaScript summary in the source document', () => {
    const home = read('index.html');

    expect(home).toContain('<title>Codex Usage Limit Reset Forecast | 24/48h Probability</title>');
    expect(home).toContain('<noscript>');
    expect(home).toContain('<h1>Codex usage-limit reset forecast</h1>');
    expect(home).toContain('href="/#alerts"');
    expect(home).toContain('href="/guides/codex-reset-prediction/"');
    expect(home).toContain('href="/zh/codex-reset-prediction/"');
    expect(home).toContain('not an account-specific reset schedule');
  });

  it('uses the canonical about URL in its metadata and sitemap', () => {
    const about = read('about/index.html');
    const sitemap = read('public/sitemap.xml');

    expect(about).toContain('href="https://codexresets.cc/about/"');
    expect(sitemap).toContain('<loc>https://codexresets.cc/about/</loc>');
  });

  it.each([
    ['codex-usage-limits', 'https://codexresets.cc/zh/codex-usage-limits/'],
    ['codex-reset-prediction', 'https://codexresets.cc/zh/codex-reset-prediction/'],
  ])('links %s and its Chinese guide in both directions', (slug, chineseUrl) => {
    const english = read(`public/guides/${slug}/index.html`);
    const chinese = read(`public/zh/${slug}/index.html`);
    const englishUrl = `https://codexresets.cc/guides/${slug}/`;

    expect(english).toContain(`hreflang="zh-CN" href="${chineseUrl}"`);
    expect(chinese).toContain(`hreflang="en" href="${englishUrl}"`);
  });
});

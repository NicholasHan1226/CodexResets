import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('homepage funnel contracts', () => {
  it('places email alerts after the 24/48h answer and before deeper evidence', () => {
    const home = read('src/pages/Home.tsx');
    const alerts = home.indexOf('id="alerts"');
    const signals = home.indexOf('id="signals"');
    const history = home.indexOf('id="history"');

    expect(alerts).toBeGreaterThan(-1);
    expect(alerts).toBeLessThan(signals);
    expect(alerts).toBeLessThan(history);
    expect(home).toContain('<GuideLinks');
  });

  it('keeps both forecast windows on screen and uses a solid subscribe CTA', () => {
    const display = read('src/sections/ProbabilityDisplay.tsx');
    const hero = read('src/sections/HeroSection.tsx');

    expect(display).toContain('[{tf}h {tf === 24 ? pct24 : pct48}%]');
    expect(hero).toContain("t('hero.question', { n: timeframe })");
    expect(hero).toContain('const verdictKey');
    expect(hero).toContain(': pct >= 60');
    expect(hero).toContain(': pct >= 30');
    expect(hero).toContain('pct24');
    expect(hero).toContain('pct48');
    expect(hero).toContain('command-action-primary');
    expect(hero).toContain("t('hero.alertCta')");
    expect(hero).toContain("t('hero.scope')");
    expect(hero).toContain('#alerts');
  });

  it('does not present mixed indicators as a second aggregate probability', () => {
    const signals = read('src/sections/SignalPanel.tsx');

    expect(signals).not.toContain('signalStrength(');
    expect(signals).not.toContain("t('signals.composite')");
    expect(signals).not.toContain("t('signals.strongCount'");
    expect(signals).not.toContain('aria-label={`${t(\'signals.composite\')}');
  });

  it('links crawlable guides and the subscribe well from search-entry pages', () => {
    const guides = [
      'public/guides/codex-usage-limits/index.html',
      'public/guides/codex-reset-prediction/index.html',
      'public/guides/codex-reset-history/index.html',
      'public/zh/codex-usage-limits/index.html',
      'public/zh/codex-reset-prediction/index.html',
    ];

    for (const path of guides) {
      const html = read(path);
      expect(html).toContain('href="/#alerts"');
      expect(html).toContain('action-primary');
    }
  });
});

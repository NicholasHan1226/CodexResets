import { describe, expect, it } from 'vitest';
import { getTranslations } from '@/lib/i18n';

describe('i18n dictionaries', () => {
  const english = getTranslations('en');
  const chinese = getTranslations('zh');

  it('keeps English and Chinese keys in lockstep', () => {
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort());
  });

  it('states that the 24h and 48h numbers are a shared forecast, not an account timer', () => {
    expect(english['hero.question']).toMatch(/today/i);
    expect(english['hero.question']).not.toContain('{n}');
    expect(chinese['hero.question']).toContain('今天');
    expect(english['hero.scope']).toMatch(/24\/48-hour forecast/i);
    expect(english['hero.scope']).toMatch(/not the timer/i);
    expect(english['hero.scope']).toMatch(/Codex/);
    expect(english['hero.windowStat']).toContain('{pct}% in {n}h');
    expect(english['subscribe.scope']).toMatch(/not your personal/i);
    expect(english['hero.scope'] + english['subscribe.scope']).not.toMatch(/Nebula|Haofei|\bEV\b/);
  });
});

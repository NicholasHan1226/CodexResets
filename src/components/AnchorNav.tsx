import { useI18n } from '@/contexts/I18nContext';

const sections = [
  { id: 'curve', key: 'nav.curve' },
  { id: 'signals', key: 'nav.signals' },
  { id: 'usage', key: 'nav.usage' },
  { id: 'rhythm', key: 'nav.rhythm' },
  { id: 'history', key: 'nav.history' },
  { id: 'calendar', key: 'nav.calendar' },
  { id: 'alerts', key: 'nav.alerts' },
];

export function AnchorNav() {
  const { t } = useI18n();

  return (
    <nav aria-label="Section navigation" className="mt-8">
      <p className="font-mono text-xs text-muted-foreground/60 flex flex-wrap gap-x-1 gap-y-1">
        {sections.map((s, i) => (
          <span key={s.id} className="inline-flex items-center">
            {i > 0 && <span className="mr-1 text-border">·</span>}
            <a
              href={`#${s.id}`}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              [{t(s.key)}]
            </a>
          </span>
        ))}
      </p>
    </nav>
  );
}

import { useEffect, useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';

const sections = [
  { id: 'curve', key: 'nav.curve' },
  { id: 'signals', key: 'nav.signals' },
  { id: 'rhythm', key: 'nav.rhythm' },
  { id: 'history', key: 'nav.history' },
  { id: 'calendar', key: 'nav.calendar' },
  { id: 'alerts', key: 'nav.alerts' },
];

export function AnchorNav() {
  const { t } = useI18n();
  const [activeId, setActiveId] = useState(() => window.location.hash.slice(1) || 'curve');

  useEffect(() => {
    const updateFromHash = () => setActiveId(window.location.hash.slice(1) || 'curve');
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-18% 0px -68% 0px', threshold: 0 }
    );

    sections.forEach(({ id }) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    window.addEventListener('hashchange', updateFromHash);

    return () => {
      observer.disconnect();
      window.removeEventListener('hashchange', updateFromHash);
    };
  }, []);

  return (
    <nav aria-label="Section navigation" className="mt-8">
      <p className="font-mono text-xs text-muted-foreground/60 flex flex-wrap gap-x-1 gap-y-1">
        {sections.map((s, i) => (
          <span key={s.id} className="inline-flex items-center">
            {i > 0 && <span className="mr-1 text-border">·</span>}
            <a
              href={`#${s.id}`}
              aria-current={activeId === s.id ? 'location' : undefined}
              onClick={() => setActiveId(s.id)}
              className={`nav-command-link ${activeId === s.id ? 'is-active' : ''}`}
            >
              [{t(s.key)}]
            </a>
          </span>
        ))}
      </p>
    </nav>
  );
}

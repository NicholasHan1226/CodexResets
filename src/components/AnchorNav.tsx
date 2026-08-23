import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';

const baseSections = [
  { id: 'curve', key: 'nav.curve' },
  { id: 'signals', key: 'nav.signals' },
  { id: 'rhythm', key: 'nav.rhythm' },
  { id: 'history', key: 'nav.history' },
  { id: 'alerts', key: 'nav.alerts' },
];

interface AnchorNavProps {
  showCalendar: boolean;
}

export function AnchorNav({ showCalendar }: AnchorNavProps) {
  const { t } = useI18n();
  const sections = useMemo(() => showCalendar
    ? [...baseSections.slice(0, 4), { id: 'calendar', key: 'nav.calendar' }, ...baseSections.slice(4)]
    : baseSections, [showCalendar]);
  const [activeId, setActiveId] = useState(() => {
    const hashId = window.location.hash.slice(1);
    return hashId && sections.some(({ id }) => id === hashId) ? hashId : 'curve';
  });

  useEffect(() => {
    const updateFromHash = () => {
      const hashId = window.location.hash.slice(1);
      setActiveId(hashId && sections.some(({ id }) => id === hashId) ? hashId : 'curve');
    };
    updateFromHash();
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
  }, [sections]);

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

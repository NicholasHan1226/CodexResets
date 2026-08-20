import { useMemo } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { RESET_HISTORY } from '@/lib/reset-data';

/**
 * Reset Calendar View - Heatmap showing historical reset patterns
 */
export function ResetCalendar() {
  const { t } = useI18n();

  const calendarData = useMemo(() => {
    const today = new Date();
    const days: Array<{ date: Date; count: number; resets: typeof RESET_HISTORY }> = [];

    for (let i = 364; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayResets = RESET_HISTORY.filter((reset) => {
        const resetDate = new Date(reset.timestamp);
        return resetDate >= date && resetDate < nextDate;
      });

      days.push({ date, count: dayResets.length, resets: dayResets });
    }

    return days;
  }, []);

  const weeks = useMemo(() => {
    const result: typeof calendarData[] = [];
    let currentWeek: typeof calendarData = [];

    const firstDay = calendarData[0].date.getDay();
    for (let i = 0; i < firstDay; i++) {
      currentWeek.push({ date: new Date(0), count: -1, resets: [] });
    }

    for (const day of calendarData) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        result.push(currentWeek);
        currentWeek = [];
      }
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ date: new Date(0), count: -1, resets: [] });
      }
      result.push(currentWeek);
    }

    return result;
  }, [calendarData]);

  const getColor = (count: number): string => {
    if (count === -1) return 'bg-transparent';
    if (count === 0) return 'bg-muted/40';
    if (count === 1) return 'bg-primary/25';
    if (count === 2) return 'bg-primary/50';
    return 'bg-primary';
  };

  const stats = useMemo(() => {
    const totalResets = RESET_HISTORY.length;
    const daysWithResets = calendarData.filter((d) => d.count > 0).length;
    const maxResetsInDay = Math.max(...calendarData.map((d) => d.count));
    return { totalResets, daysWithResets, maxResetsInDay };
  }, [calendarData]);

  return (
    <section aria-label="Reset calendar" className="max-w-3xl">
      <h2 className="text-lg font-semibold text-foreground">
        <span className="mr-2 font-mono font-normal text-primary">❯</span>
        {t('calendar.title')}
      </h2>

      <div className="mt-4 overflow-x-auto">
        <div className="flex gap-[2px] min-w-fit">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-[2px]">
              {week.map((day, dayIndex) => (
                <div
                  key={`${weekIndex}-${dayIndex}`}
                  className={`w-[10px] h-[10px] rounded-[2px] ${getColor(day.count)} ${
                    day.count > 0 ? 'cursor-default' : ''
                  }`}
                  title={
                    day.count >= 0
                      ? `${day.date.toLocaleDateString()}: ${day.count} reset(s)`
                      : ''
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend + stats — inline */}
      <p className="mt-3 font-mono text-xs text-muted-foreground">
        {t('calendar.less')}{' '}
        <span className="inline-flex gap-[2px] align-middle mx-1">
          <span className="w-[10px] h-[10px] rounded-[2px] bg-muted/40 inline-block" />
          <span className="w-[10px] h-[10px] rounded-[2px] bg-primary/25 inline-block" />
          <span className="w-[10px] h-[10px] rounded-[2px] bg-primary/50 inline-block" />
          <span className="w-[10px] h-[10px] rounded-[2px] bg-primary inline-block" />
        </span>{' '}
        {t('calendar.more')}
        <span className="mx-2 text-border">·</span>
        <span className="text-foreground">{stats.totalResets}</span> {t('calendar.totalResets').toLowerCase()}
        <span className="mx-2 text-border">·</span>
        <span className="text-foreground">{stats.daysWithResets}</span> {t('calendar.daysWithResets').toLowerCase()}
      </p>
    </section>
  );
}

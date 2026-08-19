import { useMemo } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { RESET_HISTORY } from '@/lib/reset-data';

/**
 * Reset Calendar View - Heatmap showing historical reset patterns
 * Similar to GitHub contribution graph
 */
export function ResetCalendar() {
  const { t } = useI18n();

  // Generate calendar data for the last 365 days
  const calendarData = useMemo(() => {
    const today = new Date();
    const days: Array<{ date: Date; count: number; resets: typeof RESET_HISTORY }> = [];

    // Go back 365 days
    for (let i = 364; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      // Count resets on this day
      const dayResets = RESET_HISTORY.filter((reset) => {
        const resetDate = new Date(reset.timestamp);
        return resetDate >= date && resetDate < nextDate;
      });

      days.push({
        date,
        count: dayResets.length,
        resets: dayResets,
      });
    }

    return days;
  }, []);

  // Group by weeks for display
  const weeks = useMemo(() => {
    const result: typeof calendarData[] = [];
    let currentWeek: typeof calendarData = [];

    // Pad first week if needed
    const firstDay = calendarData[0].date.getDay();
    for (let i = 0; i < firstDay; i++) {
      currentWeek.push({ date: new Date(0), count: -1, resets: [] }); // -1 = empty cell
    }

    for (const day of calendarData) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        result.push(currentWeek);
        currentWeek = [];
      }
    }

    // Pad last week
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ date: new Date(0), count: -1, resets: [] });
      }
      result.push(currentWeek);
    }

    return result;
  }, [calendarData]);

  // Get color based on reset count
  const getColor = (count: number): string => {
    if (count === -1) return 'bg-transparent';
    if (count === 0) return 'bg-muted';
    if (count === 1) return 'bg-primary/30';
    if (count === 2) return 'bg-primary/60';
    return 'bg-primary';
  };

  // Get month labels
  const monthLabels = useMemo(() => {
    const labels: Array<{ month: string; weekIndex: number }> = [];
    let lastMonth = -1;

    weeks.forEach((week, weekIndex) => {
      const firstDay = week.find((d) => d.count >= 0);
      if (firstDay) {
        const month = firstDay.date.getMonth();
        if (month !== lastMonth) {
          labels.push({
            month: firstDay.date.toLocaleDateString(undefined, { month: 'short' }),
            weekIndex,
          });
          lastMonth = month;
        }
      }
    });

    return labels;
  }, [weeks]);

  // Stats
  const stats = useMemo(() => {
    const totalResets = RESET_HISTORY.length;
    const daysWithResets = calendarData.filter((d) => d.count > 0).length;
    const maxResetsInDay = Math.max(...calendarData.map((d) => d.count));

    return { totalResets, daysWithResets, maxResetsInDay };
  }, [calendarData]);

  return (
    <section className="bg-card rounded-lg shadow-card p-5" aria-label="Reset calendar">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        {t('calendar.title')}
      </h2>
      <div className="mt-4">
        {/* Month labels */}
        <div className="flex mb-1 text-xs text-muted-foreground">
          {monthLabels.map((label, i) => (
            <span
              key={i}
              style={{ marginLeft: i === 0 ? 0 : undefined }}
              className="absolute"
            >
              {label.month}
            </span>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="overflow-x-auto">
          <div className="flex gap-0.5 min-w-fit">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-0.5">
                {week.map((day, dayIndex) => (
                  <div
                    key={`${weekIndex}-${dayIndex}`}
                    className={`w-2.5 h-2.5 rounded-sm ${getColor(day.count)} ${
                      day.count > 0 ? 'cursor-pointer hover:ring-1 hover:ring-primary/50' : ''
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

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
          <span>{t('calendar.less')}</span>
          <div className="flex gap-0.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-muted" />
            <div className="w-2.5 h-2.5 rounded-sm bg-primary/30" />
            <div className="w-2.5 h-2.5 rounded-sm bg-primary/60" />
            <div className="w-2.5 h-2.5 rounded-sm bg-primary" />
          </div>
          <span>{t('calendar.more')}</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/10">
          <div className="text-center">
            <div className="text-lg font-mono text-primary">{stats.totalResets}</div>
            <div className="text-xs text-muted-foreground">{t('calendar.totalResets')}</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-mono text-primary">{stats.daysWithResets}</div>
            <div className="text-xs text-muted-foreground">{t('calendar.daysWithResets')}</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-mono text-primary">{stats.maxResetsInDay}</div>
            <div className="text-xs text-muted-foreground">{t('calendar.maxPerDay')}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

import { useI18n } from '@/contexts/I18nContext';

/**
 * Loading skeleton — mirrors the real doc-flow layout (max-w-4xl,
 * terminal hero + sections) so first paint doesn't jump.
 */
function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-sm bg-muted/70 ${className}`} />;
}

export function DashboardSkeleton() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background" role="main" aria-busy="true" aria-label={t('common.loading')}>
      {/* Status header */}
      <div className="border-b border-border/20">
        <div className="mx-auto flex h-12 max-w-4xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Bar className="h-4 w-28" />
            <Bar className="h-3 w-10" />
          </div>
          <div className="flex items-center gap-3">
            <Bar className="h-3 w-16" />
            <Bar className="h-3 w-12" />
          </div>
        </div>
        <Bar className="mx-4 mb-2 h-11 w-[calc(100%_-_2rem)] md:hidden" />
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <div className="border border-border/50 p-5">
          <Bar className="h-3 w-3/4 max-w-xs" />
          <Bar className="mt-2 h-6 w-1/2" />
          <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_200px]">
            <Bar className="h-56 w-full" />
            <div className="row-start-1 md:col-start-2">
              <Bar className="h-4 w-32" />
              <Bar className="mt-4 h-16 w-28" />
              <Bar className="mt-5 h-3 w-3/4" />
              <Bar className="mt-3 h-3 w-full" />
            </div>
          </div>
          <Bar className="mt-3 h-3 w-full" />
        </div>

        <hr className="my-10 border-border/30" />

        {/* Alerts well — sits after the answer so first paint matches the live funnel */}
        <Bar className="h-5 w-40" />
        <Bar className="mt-3 h-4 w-full max-w-xl" />
        <Bar className="mt-4 h-28 w-full max-w-xl" />

        <hr className="my-10 border-border/30" />

        <Bar className="h-5 w-44" />
      </div>
    </div>
  );
}

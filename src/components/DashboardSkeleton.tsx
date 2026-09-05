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
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        {/* Hero: prompt line */}
        <Bar className="h-4 w-64" />

        {/* Hero: giant probability */}
        <div className="mt-10">
          <div className="flex items-center justify-between">
            <Bar className="h-3 w-32" />
            <Bar className="h-4 w-20" />
          </div>
          <Bar className="mt-4 h-24 w-44 sm:h-32" />
          <Bar className="mt-5 h-3.5 w-full max-w-md" />
          <Bar className="mt-3 h-4 w-36" />
        </div>

        {/* Hero: meta + actions */}
        <Bar className="mt-8 h-3 w-3/4" />
        <Bar className="mt-4 h-4 w-full" />
        <Bar className="mt-2 h-4 w-2/3" />
        <Bar className="mt-8 h-3.5 w-56" />

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

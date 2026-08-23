/**
 * Loading skeleton — mirrors the real doc-flow layout (max-w-3xl,
 * terminal hero + sections) so first paint doesn't jump.
 */
function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-sm bg-muted/70 ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background" role="main" aria-label="Dashboard loading">
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

        {/* Hero: giant probability + ASCII bar */}
        <div className="mt-10">
          <div className="flex items-center justify-between">
            <Bar className="h-3 w-32" />
            <Bar className="h-4 w-20" />
          </div>
          <Bar className="mt-4 h-24 w-44 sm:h-32" />
          <Bar className="mt-5 h-3.5 w-full max-w-md" />
          <Bar className="mt-3 h-4 w-36" />
        </div>

        {/* Hero: meta + advice */}
        <Bar className="mt-8 h-3 w-3/4" />
        <Bar className="mt-4 h-4 w-full" />
        <Bar className="mt-2 h-4 w-2/3" />
        <Bar className="mt-8 h-3.5 w-56" />

        <hr className="my-10 border-border/30" />

        {/* Curve section */}
        <Bar className="h-5 w-44" />
        <Bar className="mt-4 h-56 w-full" />

        <hr className="my-10 border-border/30" />

        {/* Signals section */}
        <Bar className="h-5 w-36" />
        <div className="mt-4 space-y-3">
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-11/12" />
          <Bar className="h-4 w-4/5" />
          <Bar className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

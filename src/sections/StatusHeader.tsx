import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Activity, Radio, Globe, Database } from "lucide-react";

interface StatusHeaderProps {
  isLive: boolean;
  modelVersion: string;
  usingRealData?: boolean;
  signalsLoading?: boolean;
}

export function StatusHeader({ 
  isLive, 
  modelVersion, 
  usingRealData = false,
  signalsLoading = false,
}: StatusHeaderProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-border pb-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Activity className="h-6 w-6 text-primary" />
          {isLive && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
          )}
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Codex Resets
          </h1>
          <p className="text-xs text-muted-foreground">
            Next reset prediction model
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Data source indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium",
              usingRealData 
                ? "bg-primary/10 text-primary" 
                : "bg-muted text-muted-foreground"
            )}>
              {signalsLoading ? (
                <>
                  <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-current" />
                  <span>LOADING</span>
                </>
              ) : usingRealData ? (
                <>
                  <Globe className="h-2.5 w-2.5" />
                  <span>LIVE DATA</span>
                </>
              ) : (
                <>
                  <Database className="h-2.5 w-2.5" />
                  <span>HISTORICAL</span>
                </>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {usingRealData 
              ? "Fetching real signals from public sources (Tibo tweets, OpenAI status)" 
              : "Using historical data (live signal fetch unavailable)"}
          </TooltipContent>
        </Tooltip>

        <div className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium",
          isLive
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground"
        )}>
          <Radio className="h-3 w-3" />
          {isLive ? "LIVE" : "PAUSED"}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
              <span className="font-mono">{modelVersion}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            Signal model version
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

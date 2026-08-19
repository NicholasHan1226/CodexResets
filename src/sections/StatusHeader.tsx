import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Activity, Radio, Wifi, WifiOff } from "lucide-react";

interface StatusHeaderProps {
  isLive: boolean;
  onToggleLive: (live: boolean) => void;
  modelVersion: string;
  generatedAt: number;
}

export function StatusHeader({ isLive, onToggleLive, modelVersion, generatedAt }: StatusHeaderProps) {
  const timeAgo = Math.floor((Date.now() - generatedAt) / 1000);

  return (
    <header className="flex items-center justify-between border-b border-border pb-4 mb-6">
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

      <div className="flex items-center gap-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onToggleLive(!isLive)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                isLive
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {isLive ? (
                <>
                  <Radio className="h-3 w-3" />
                  LIVE
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  PAUSED
                </>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {isLive ? "Click to pause real-time updates" : "Click to resume real-time updates"}
          </TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Wifi className="h-3 w-3" />
          <span>{modelVersion}</span>
          <span className="text-border">|</span>
          <span>{timeAgo}s ago</span>
        </div>
      </div>
    </header>
  );
}

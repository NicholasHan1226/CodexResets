import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { BankedReset } from "@/types/reset";
import { Package, Plus, Check, AlertTriangle } from "lucide-react";

const STORAGE_KEY = "codex-resets-banked";

export function BankedResets() {
  const [resets, setResets] = useState<BankedReset[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [issueDate, setIssueDate] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setResets(JSON.parse(stored) as BankedReset[]);
      } catch {
        // ignore
      }
    }
  }, []);

  const saveResets = (newResets: BankedReset[]) => {
    setResets(newResets);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newResets));
  };

  const handleAdd = () => {
    if (!issueDate) return;
    const issue = new Date(issueDate);
    const expiry = new Date(issue);
    expiry.setDate(expiry.getDate() + 30);

    const newReset: BankedReset = {
      id: crypto.randomUUID(),
      issueDate: issue.toISOString(),
      expiryDate: expiry.toISOString(),
      used: false,
    };
    saveResets([newReset, ...resets]);
    setIssueDate("");
    setShowAdd(false);
  };

  const handleUse = (id: string) => {
    saveResets(resets.map((r) => (r.id === id ? { ...r, used: true } : r)));
  };

  const handleRemove = (id: string) => {
    saveResets(resets.filter((r) => r.id !== id));
  };

  const available = resets.filter((r) => !r.used);
  const used = resets.filter((r) => r.used);

  const getDaysRemaining = (expiryDate: string) => {
    const diff = new Date(expiryDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Package className="h-4 w-4" />
            BANKED RESETS
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => setShowAdd(!showAdd)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add form */}
        {showAdd && (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground mb-1 block">Issue date</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full rounded-md border border-border bg-muted px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={handleAdd}>
              Add
            </Button>
          </div>
        )}

        {/* Available resets */}
        {available.length === 0 && !showAdd && (
          <div className="text-xs text-muted-foreground text-center py-2">
            No banked resets. Refer friends to earn resets.
          </div>
        )}
        {available.map((reset) => {
          const daysLeft = getDaysRemaining(reset.expiryDate);
          const totalDays = 30;
          const progressPercent = ((totalDays - daysLeft) / totalDays) * 100;
          const isExpiringSoon = daysLeft <= 5;

          return (
            <div key={reset.id} className="rounded-lg border border-border/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground">
                  {daysLeft > 0 ? `${daysLeft} days left` : "Expired"}
                </span>
                <div className="flex gap-1">
                  {daysLeft > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      onClick={() => handleUse(reset.id)}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Use
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => handleRemove(reset.id)}
                  >
                    <AlertTriangle className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              {/* Expiry progress bar */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    isExpiringSoon ? "bg-destructive" : "bg-primary"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                Issued: {new Date(reset.issueDate).toLocaleDateString()} · Expires: {new Date(reset.expiryDate).toLocaleDateString()}
              </div>
            </div>
          );
        })}

        {/* Used resets */}
        {used.length > 0 && (
          <div className="pt-2 border-t border-border/30">
            <div className="text-[10px] text-muted-foreground mb-1">Used ({used.length})</div>
            {used.map((reset) => (
              <div key={reset.id} className="text-[10px] text-muted-foreground/50 line-through font-mono">
                {new Date(reset.issueDate).toLocaleDateString()}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

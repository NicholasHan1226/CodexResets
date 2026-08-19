import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { subscribeEmail, getSubscriberCount, type SubscriptionResult } from "@/lib/subscription";
import { Mail, CheckCircle2, Loader2, Users, AlertCircle } from "lucide-react";

export function SubscribePanel() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);

  useEffect(() => {
    getSubscriberCount()
      .then(setSubscriberCount)
      .catch(() => setSubscriberCount(null));
  }, [status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) return;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setStatus("error");
      setMessage("Please enter a valid email address.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const result: SubscriptionResult = await subscribeEmail(email);
      if (result.success) {
        setStatus("success");
        setMessage(result.message);
        if (!result.alreadySubscribed) {
          setEmail("");
        }
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Subscription failed. Please try again.");
    }
  };

  const handleReset = () => {
    setStatus("idle");
    setMessage("");
    setEmail("");
  };

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Mail className="h-4 w-4" />
          GET NOTIFIED
          {subscriberCount !== null && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-normal text-muted-foreground/60">
              <Users className="h-3 w-3" />
              {subscriberCount} subscriber{subscriberCount !== 1 ? "s" : ""}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {status === "success" ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <CheckCircle2 className="h-8 w-8 text-primary" />
            <p className="text-sm text-foreground text-center">{message}</p>
            <button
              onClick={handleReset}
              className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Subscribe another email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Get an email notification when the next Codex reset window is predicted.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "error") setStatus("idle");
                }}
                placeholder="you@example.com"
                disabled={status === "loading"}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 transition-colors"
              />
              <Button
                type="submit"
                disabled={status === "loading" || !email.trim()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium px-4 transition-colors disabled:opacity-50"
              >
                {status === "loading" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Subscribe"
                )}
              </Button>
            </div>
            {status === "error" && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                <span>{message}</span>
              </div>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

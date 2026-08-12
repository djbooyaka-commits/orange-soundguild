import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Sub = { tier: string; expires_at: string };

const DAY = 24 * 60 * 60 * 1000;
const WARN_DAYS = 7;

export default function SubscriptionRenewalBanner() {
  const { user } = useAuth();
  const [sub, setSub] = useState<Sub | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setSub(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("artist_subscriptions")
        .select("tier, expires_at")
        .eq("user_id", user.id)
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setSub((data as Sub | null) ?? null);
      try {
        const key = `sub_renew_dismissed_${user.id}`;
        const until = Number(window.localStorage.getItem(key) ?? 0);
        setDismissed(Date.now() < until);
      } catch {
        setDismissed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || !sub || dismissed) return null;

  const msLeft = new Date(sub.expires_at).getTime() - Date.now();
  if (msLeft > WARN_DAYS * DAY) return null;

  const expired = msLeft <= 0;
  const daysLeft = Math.max(1, Math.ceil(msLeft / DAY));
  const label = sub.tier === "artist" ? "Artist" : "Superfan";

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(`sub_renew_dismissed_${user.id}`, String(Date.now() + DAY));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-3">
      <div className="flex w-full max-w-2xl items-start gap-3 rounded-xl border border-primary/40 bg-card p-3 shadow-lg">
        <AlertCircle
          className={`mt-0.5 h-5 w-5 shrink-0 ${expired ? "text-destructive" : "text-primary"}`}
        />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold">
            {expired
              ? `Your ${label} plan has expired`
              : `Your ${label} plan renews in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
          </div>
          <p className="mt-0.5 text-muted-foreground">
            PayPal and Phantom payments cover 30 days and don&apos;t renew automatically — renew to
            keep your {label} access.
          </p>
        </div>
        <Link
          to="/upgrade"
          className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Renew
        </Link>
        <button
          onClick={dismiss}
          aria-label="Dismiss renewal reminder"
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

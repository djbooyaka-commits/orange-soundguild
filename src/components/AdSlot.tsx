import { useAccountType } from "@/hooks/useAccountType";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

interface AdSlotProps {
  variant: "banner" | "player";
  className?: string;
}

/**
 * Placeholder ad slot. Hidden for Artist and Superfan accounts.
 * Signed-out visitors and free ("fan") accounts see the ad.
 */
export function AdSlot({ variant, className = "" }: AdSlotProps) {
  const { user } = useAuth();
  const { accountType, loading } = useAccountType();

  // Don't render anything until we know the account type for signed-in users
  // (avoids a flash for paid users).
  if (user && loading) return null;
  if (accountType === "artist" || accountType === "superfan") return null;

  if (variant === "banner") {
    return (
      <aside
        aria-label="Advertisement"
        className={`relative overflow-hidden rounded-xl border border-dashed border-border bg-card ${className}`}
      >
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center sm:flex-row sm:justify-between sm:gap-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Ad
            </span>
            <p className="text-sm text-muted-foreground">
              Your ad could be here — this space is reserved for advertisers.
            </p>
          </div>
          <Link
            to="/upgrade"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Go ad-free
          </Link>
        </div>
      </aside>
    );
  }

  // player variant — compact strip that sits above the player bar
  return (
    <aside
      aria-label="Advertisement"
      className={`border-t border-white/10 bg-black/40 text-white/80 backdrop-blur ${className}`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-1.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
            Ad
          </span>
          <p className="truncate text-xs text-white/70">
            Advertise to listeners here.
          </p>
        </div>
        <Link
          to="/upgrade"
          className="shrink-0 text-[11px] font-semibold text-primary hover:underline"
        >
          Remove ads
        </Link>
      </div>
    </aside>
  );
}

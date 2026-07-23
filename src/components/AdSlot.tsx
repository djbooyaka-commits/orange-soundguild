import { useEffect, useMemo, useState } from "react";
import { useAccountType } from "@/hooks/useAccountType";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signMany } from "@/lib/signMedia";

interface AdSlotProps {
  variant: "banner" | "player";
  className?: string;
}

type CampaignRow = {
  id: string;
  mode: "track" | "custom";
  image_url: string | null;
  headline: string | null;
  dest_url: string | null;
  track_id: string | null;
  tracks?: { id: string; title: string; cover_art_url: string | null } | null;
};

type ResolvedAd = {
  id: string;
  href: string;
  linkExternal: boolean;
  title: string;
  image: string | null;
};

function useLiveCampaign(placement: "feed" | "player"): ResolvedAd | null {
  const [ad, setAd] = useState<ResolvedAd | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("ad_campaigns_public" as never)
        .select("id, mode, image_url, headline, dest_url, track_id, tracks(id, title, cover_art_url)")
        .contains("placements", [placement])
        .limit(20);

      if (cancelled) return;
      const rows = (data ?? []) as unknown as CampaignRow[];
      if (rows.length === 0) {
        setAd(null);
        return;
      }
      const pick = rows[Math.floor(Math.random() * rows.length)];
      let image: string | null = null;
      let href = "/";
      let title = pick.headline ?? "Promoted";
      if (pick.mode === "custom") {
        image = pick.image_url;
        href = pick.dest_url ?? "/";
      } else if (pick.tracks) {
        title = pick.tracks.title;
        href = `/t/${pick.tracks.id}`;
        if (pick.tracks.cover_art_url) {
          const [signed] = await signMany([
            { bucket: "covers", path: pick.tracks.cover_art_url },
          ]);
          image = signed;
        }
      }
      if (cancelled) return;
      setAd({
        id: pick.id,
        href,
        linkExternal: pick.mode === "custom",
        title,
        image,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [placement]);

  return ad;
}

/**
 * Ad slot. Hidden for Artist and Superfan accounts. Renders a live paid
 * campaign when one is active for this placement, otherwise a small
 * "Advertise here" placeholder.
 */
export function AdSlot({ variant, className = "" }: AdSlotProps) {
  const { user } = useAuth();
  const { accountType, loading } = useAccountType();
  const placement = variant === "banner" ? "feed" : "player";
  const ad = useLiveCampaign(placement);

  const linkProps = useMemo(() => {
    if (!ad) return null;
    if (ad.linkExternal) {
      return { href: ad.href, target: "_blank" as const, rel: "noopener noreferrer sponsored" };
    }
    return { href: ad.href };
  }, [ad]);

  if (user && loading) return null;
  if (accountType === "artist" || accountType === "superfan") return null;

  const hasAd = !!ad;

  if (variant === "banner") {
    if (hasAd && ad && linkProps) {
      return (
        <aside
          aria-label="Advertisement"
          className={`relative overflow-hidden rounded-xl border border-border bg-card ${className}`}
        >
          <a {...linkProps} className="flex items-center gap-4 px-4 py-4 sm:px-6">
            {ad.image ? (
              <img
                src={ad.image}
                alt=""
                className="h-20 w-32 shrink-0 rounded-md object-cover sm:h-24 sm:w-40"
              />
            ) : (
              <div className="h-20 w-32 shrink-0 rounded-md bg-primary/10 sm:h-24 sm:w-40" />
            )}
            <div className="min-w-0 flex-1">
              <span className="inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                Sponsored
              </span>
              <p className="mt-1 truncate text-base font-semibold sm:text-lg">{ad.title}</p>
            </div>
          </a>
        </aside>
      );
    }
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
            to="/ads"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Advertise here
          </Link>
        </div>
      </aside>
    );
  }

  // player variant
  if (hasAd && ad && linkProps) {
    return (
      <aside
        aria-label="Advertisement"
        className={`border-t border-white/10 bg-black/40 text-white/80 backdrop-blur ${className}`}
      >
        <a
          {...linkProps}
          className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-1.5 sm:px-6"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
              Sponsored
            </span>
            <p className="truncate text-xs text-white/90">{ad.title}</p>
          </div>
          <span className="shrink-0 text-[11px] font-semibold text-primary hover:underline">Open →</span>
        </a>
      </aside>
    );
  }
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
          <p className="truncate text-xs text-white/70">Advertise to listeners here.</p>
        </div>
        <Link to="/ads" className="shrink-0 text-[11px] font-semibold text-primary hover:underline">
          Buy ads
        </Link>
      </div>
    </aside>
  );
}

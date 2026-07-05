import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Sparkles, Loader2, ExternalLink } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/hooks/useAuth";
import { useAccountType } from "@/hooks/useAccountType";
import { useUserTracks } from "@/lib/feed";
import type { Track } from "@/lib/tracks";
import {
  AD_PACKAGES,
  type AdPackage,
  type AdPlacement,
  type AdMode,
  getAdPackages,
  createAdPaypalOrder,
  captureAdPaypalOrder,
  listMyCampaigns,
} from "@/lib/api/ads.functions";

export const Route = createFileRoute("/ads")({
  head: () => ({
    meta: [
      { title: "Buy ad space — Orange Sound Guild" },
      {
        name: "description",
        content:
          "Promote your tracks to Orange Sound Guild listeners. Pick a package, choose your placements and go live in minutes.",
      },
      { property: "og:title", content: "Buy ad space — Orange Sound Guild" },
      {
        property: "og:description",
        content: "Advertise your music on the home feed and player bar.",
      },
      { property: "og:url", content: "https://orange-soundguild.lovable.app/ads" },
    ],
    links: [{ rel: "canonical", href: "https://orange-soundguild.lovable.app/ads" }],
  }),
  component: AdsPage,
});

const PLACEMENT_LABEL: Record<AdPlacement, string> = {
  feed: "Home feed banner",
  player: "Player bar strip",
};

function AdsPage() {
  const { user, loading: authLoading } = useAuth();
  const { isArtist, loading: acctLoading } = useAccountType();
  const navigate = useNavigate();

  const [pkg, setPkg] = useState<AdPackage>("silver");
  const [placements, setPlacements] = useState<AdPlacement[]>(["feed"]);
  const [mode, setMode] = useState<AdMode>("track");
  const [trackId, setTrackId] = useState<string>("");
  const [imageUrl, setImageUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [destUrl, setDestUrl] = useState("");
  const [cfg, setCfg] = useState<{ clientId: string; mode: "sandbox" | "live" } | null>(null);
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [myCampaigns, setMyCampaigns] = useState<Awaited<ReturnType<typeof listMyCampaigns>>["campaigns"]>([]);

  const loadConfig = useServerFn(getAdPackages);
  const loadMine = useServerFn(listMyCampaigns);
  const createOrder = useServerFn(createAdPaypalOrder);
  const captureOrder = useServerFn(captureAdPaypalOrder);

  const { tracks: myTracks } = useUserTracks(user?.id ?? null);

  useEffect(() => {
    if (!user) return;
    loadConfig()
      .then((c) => setCfg({ clientId: c.paypalClientId, mode: c.paypalMode }))
      .catch((e: unknown) =>
        setMessage(e instanceof Error ? e.message : "Failed to load PayPal"),
      );
    loadMine()
      .then((r) => setMyCampaigns(r.campaigns))
      .catch(() => { /* ignore */ });
  }, [user, loadConfig, loadMine]);

  const pkgInfo = AD_PACKAGES[pkg];

  // Clamp placements when switching to Bronze
  useEffect(() => {
    if (placements.length > pkgInfo.maxPlacements) {
      setPlacements(placements.slice(0, pkgInfo.maxPlacements));
    }
  }, [pkg, pkgInfo.maxPlacements, placements]);

  const togglePlacement = (p: AdPlacement) => {
    setPlacements((prev) => {
      if (prev.includes(p)) {
        if (prev.length === 1) return prev; // require at least 1
        return prev.filter((x) => x !== p);
      }
      if (prev.length >= pkgInfo.maxPlacements) {
        toast.error(`${pkgInfo.label} allows up to ${pkgInfo.maxPlacements} placement(s).`);
        return prev;
      }
      return [...prev, p];
    });
  };

  const canBuy = useMemo(() => {
    if (!user || !isArtist) return false;
    if (placements.length === 0) return false;
    if (mode === "track") return !!trackId;
    return (
      /^https:\/\//i.test(imageUrl) &&
      /^https:\/\//i.test(destUrl) &&
      headline.trim().length >= 3
    );
  }, [user, isArtist, placements, mode, trackId, imageUrl, destUrl, headline]);

  if (authLoading || acctLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="mx-auto flex max-w-3xl items-center justify-center px-4 py-24">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight">Buy ad space</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with an Artist account to purchase ad campaigns.
          </p>
          <Link
            to="/auth"
            className="mt-6 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Sign in
          </Link>
        </main>
      </div>
    );
  }

  if (!isArtist) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight">Ads are for Artists</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Upgrade to an Artist account to promote your tracks on the home feed and player.
          </p>
          <Link
            to="/upgrade"
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            <Sparkles className="h-4 w-4" /> Become an Artist
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <header>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3 w-3" /> Artist tools
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Buy ad space</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Promote your music to Orange Sound Guild listeners. Payment via PayPal — ads go live automatically.
          </p>
        </header>

        {/* Packages */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">1. Pick a package</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {(Object.keys(AD_PACKAGES) as AdPackage[]).map((key) => {
              const p = AD_PACKAGES[key];
              const active = pkg === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPkg(key)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-primary bg-primary/5 shadow-[var(--shadow-glow)]"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-bold">{p.label}</span>
                    <span className="text-2xl font-bold text-primary">${p.priceUsd}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{p.blurb}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Placements */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            2. Choose placements
            <span className="ml-2 text-xs font-normal text-muted-foreground/70">
              (up to {pkgInfo.maxPlacements})
            </span>
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(["feed", "player"] as AdPlacement[]).map((p) => {
              const active = placements.includes(p);
              return (
                <label
                  key={p}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                    active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => togglePlacement(p)}
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <div>
                    <p className="text-sm font-semibold">{PLACEMENT_LABEL[p]}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p === "feed"
                        ? "Large banner on the home feed, above the tracks."
                        : "Compact strip above the mini player, visible sitewide."}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        {/* Ad content */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">3. Ad content</h2>
          <div className="mt-3 flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setMode("track")}
              className={`rounded-full px-3 py-1.5 font-medium ${
                mode === "track" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              }`}
            >
              Promote one of my tracks
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`rounded-full px-3 py-1.5 font-medium ${
                mode === "custom" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              }`}
            >
              Custom image + link
            </button>
          </div>

          {mode === "track" ? (
            <div className="mt-4">
              {myTracks.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                  You haven't uploaded any tracks yet. Upload one, then come back to promote it.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {myTracks.map((t: Track) => {
                    const active = trackId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTrackId(t.id)}
                        className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                          active
                            ? "border-primary bg-primary/5"
                            : "border-border bg-card hover:border-primary/40"
                        }`}
                      >
                        <img src={t.cover} alt="" className="h-12 w-12 rounded-md object-cover" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{t.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{t.genre}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <input
                type="url"
                placeholder="Image URL (https://…)"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
              <input
                type="text"
                placeholder="Headline (3–80 chars)"
                value={headline}
                maxLength={80}
                onChange={(e) => setHeadline(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
              <input
                type="url"
                placeholder="Destination URL (https://…)"
                value={destUrl}
                onChange={(e) => setDestUrl(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
              {imageUrl && /^https:\/\//i.test(imageUrl) && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="mb-2 text-xs text-muted-foreground">Preview</p>
                  <img src={imageUrl} alt="Preview" className="h-32 w-full rounded-md object-cover" />
                  {headline && <p className="mt-2 text-sm font-semibold">{headline}</p>}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Checkout */}
        <section className="mt-8 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total</p>
              <p className="text-3xl font-bold text-primary">${pkgInfo.priceUsd}.00</p>
              <p className="text-xs text-muted-foreground">
                {pkgInfo.label} · {pkgInfo.days} days · {placements.length} placement
                {placements.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="mt-4">
            {!canBuy && (
              <p className="mb-3 text-xs text-muted-foreground">
                {mode === "track" ? "Select a track to continue." : "Fill in image, headline and destination URL to continue."}
              </p>
            )}
            {cfg && cfg.clientId ? (
              <div className={canBuy ? "" : "pointer-events-none opacity-50"}>
                <PayPalScriptProvider
                  options={{ clientId: cfg.clientId, currency: "USD", intent: "capture" }}
                >
                  <PayPalButtons
                    style={{ layout: "vertical", label: "pay", shape: "rect" }}
                    disabled={!canBuy || status === "processing" || status === "success"}
                    forceReRender={[pkg, placements.join(","), mode, trackId, imageUrl, headline, destUrl]}
                    createOrder={async () => {
                      setStatus("processing");
                      setMessage(null);
                      const { orderId } = await createOrder({
                        data: {
                          package: pkg,
                          placements,
                          mode,
                          trackId: mode === "track" ? trackId : null,
                          imageUrl: mode === "custom" ? imageUrl : null,
                          headline: mode === "custom" ? headline : null,
                          destUrl: mode === "custom" ? destUrl : null,
                        },
                      });
                      return orderId;
                    }}
                    onApprove={async (data) => {
                      try {
                        const res = await captureOrder({ data: { orderId: data.orderID } });
                        setStatus("success");
                        setMessage(`Your ad is live until ${new Date(res.endsAt).toLocaleDateString()}.`);
                        loadMine().then((r) => setMyCampaigns(r.campaigns));
                        setTimeout(() => navigate({ to: "/" }), 2000);
                      } catch (e) {
                        setStatus("error");
                        setMessage(e instanceof Error ? e.message : "Capture failed");
                      }
                    }}
                    onError={(err) => {
                      setStatus("error");
                      setMessage(err instanceof Error ? err.message : "PayPal error");
                    }}
                    onCancel={() => {
                      setStatus("idle");
                      setMessage(null);
                    }}
                  />
                </PayPalScriptProvider>
              </div>
            ) : (
              <div className="flex h-16 items-center justify-center rounded-xl border border-border bg-muted/30 text-xs text-muted-foreground">
                {cfg ? "PayPal is not configured." : <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
            )}
            {status === "success" && message && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{message}</span>
              </div>
            )}
            {status === "error" && message && (
              <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {message}
              </div>
            )}
          </div>
        </section>

        {/* My campaigns */}
        {myCampaigns.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">My campaigns</h2>
            <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
              {myCampaigns.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {AD_PACKAGES[c.package].label} · {c.placements.map((p) => PLACEMENT_LABEL[p as AdPlacement]).join(" + ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.mode === "custom" ? c.headline : "Promoted track"} · ${(c.amount_cents / 100).toFixed(2)}
                      {c.ends_at && ` · ends ${new Date(c.ends_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        c.status === "active"
                          ? "bg-green-500/15 text-green-700 dark:text-green-400"
                          : c.status === "pending"
                          ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {c.status}
                    </span>
                    {c.dest_url && (
                      <a
                        href={c.dest_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary"
                        aria-label="Open destination"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

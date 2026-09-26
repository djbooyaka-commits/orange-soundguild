import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Music2, Loader2, CheckCircle2, RefreshCw, Settings2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getSpotifyAuthUrl,
  getMySpotifyStatus,
  pollSpotifyRecent,
  disconnectSpotify,
  setMySpotifyApp,
  deleteMySpotifyApp,
} from "@/lib/api/spotify.functions";

function spotifyPollMessage(result: { added?: number; error?: string | null; scanned?: number; skippedNotCurated?: number; retryAfter?: number | null }) {
  if (result.error === "spotify_account_not_allowed" || result.error === "spotify_403") {
    return "Spotify blocked tracking: this account isn't on the app's allowed-user list yet. Once the site's Spotify app is approved for Extended Quota (free, via Spotify Developer Dashboard), this cap disappears and any Spotify user works. For now, use your own Spotify app below to skip the cap immediately.";
  }
  if (result.error === "spotify_rate_limited" || result.error === "spotify_429") {
    const wait = result.retryAfter ? Math.ceil(result.retryAfter / 60) : null;
    return `Spotify is asking us to slow down (too many checks in a short time). Nothing is lost — your plays will be picked up on the next check${wait ? ` in about ${wait} minute${wait === 1 ? "" : "s"}` : " shortly"}.`;
  }
  if (result.error) return `Spotify sync error: ${result.error}`;

  if (result.added) return `+${result.added} new stream point${result.added === 1 ? "" : "s"}`;
  if (result.scanned && result.skippedNotCurated === result.scanned) {
    return `Up to date — scanned ${result.scanned} recent play${result.scanned === 1 ? "" : "s"}, but none were played from a tracked Curator playlist. Play the playlist from the playlist page (not from Liked Songs, search, or an autoplay/radio queue) so Spotify reports the playlist.`;
  }
  return "Up to date";
}

const REDIRECT_URI_HINT =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/public/spotify/callback`
    : "https://orangesoundguild.com/api/public/spotify/callback";

export function SpotifyConnectCard() {
  const authUrlFn = useServerFn(getSpotifyAuthUrl);
  const statusFn = useServerFn(getMySpotifyStatus);
  const pollFn = useServerFn(pollSpotifyRecent);
  const disconnectFn = useServerFn(disconnectSpotify);
  const setAppFn = useServerFn(setMySpotifyApp);
  const deleteAppFn = useServerFn(deleteMySpotifyApp);

  const [status, setStatus] = useState<{
    connected: boolean;
    points: number;
    lastPolledAt: string | null;
    autoSyncUntil: string | null;
    spotifyUserId: string | null;
    hasCustomApp: boolean;
    customClientId: string | null;
    hourly: { hour: number; count: number }[];
    lastPlayAt: string | null;
    todayTotal: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [showApp, setShowApp] = useState(true);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const refresh = async () => {
    try {
      const s = await statusFn();
      setStatus(s);
      return s;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const storedPanelState = window.localStorage.getItem("spotifyAppSetupOpen");
    if (storedPanelState === "closed") setShowApp(false);
    if (storedPanelState === "open") setShowApp(true);

    const storedClientId = window.localStorage.getItem("spotifyAppClientIdDraft");
    if (storedClientId) setClientId(storedClientId);

    void refresh();
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("spotify");
    if (flag === "connected") setMsg("Spotify connected!");
    else if (flag && flag !== "connected") setMsg(`Spotify error: ${flag}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoActive = !!status?.autoSyncUntil && new Date(status.autoSyncUntil).getTime() > Date.now();

  // Auto-update only while this member is actively streaming a Curator playlist.
  useEffect(() => {
    if (!status?.connected || !autoActive) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void (async () => {
        try {
          await pollFn({ data: {} });
          await refresh();
        } catch {
          // ignore
        }
      })();
    }, 20 * 60 * 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected, autoActive]);

  // Lightweight status-only refresh (no Spotify API call) so the hourly feed
  // and auto-update countdown update live while the card is open.
  useEffect(() => {
    if (!status?.connected) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refresh();
    }, 60 * 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected]);


  const toggleAppSetup = () => {
    setShowApp((current) => {
      const next = !current;
      window.localStorage.setItem("spotifyAppSetupOpen", next ? "open" : "closed");
      return next;
    });
  };

  const connect = async () => {
    setBusy(true);
    try {
      const { url } = await authUrlFn();
      window.location.href = url;
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to start Spotify auth");
      setBusy(false);
    }
  };

  const poll = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await pollFn({ data: { manual: true } });
      setMsg(spotifyPollMessage(r));
      if (!r.error) setSyncedAt(Date.now());
      await refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Poll failed");
    } finally {
      setBusy(false);
      window.setTimeout(() => setSyncedAt((current) => {
        // only clear if no newer sync happened during the timeout
        if (current && Date.now() - current >= 2500) return null;
        return current;
      }), 2500);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectFn();
      await refresh();
      setMsg("Spotify disconnected");
    } finally {
      setBusy(false);
    }
  };

  const saveApp = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await setAppFn({ data: { clientId: clientId.trim(), clientSecret: clientSecret.trim() } });
      window.localStorage.removeItem("spotifyAppClientIdDraft");
      setClientId("");
      setClientSecret("");
      await refresh();
      setMsg("Your Spotify app is saved. Click Connect Spotify to authorize with it.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to save app");
    } finally {
      setBusy(false);
    }
  };

  const removeApp = async () => {
    setBusy(true);
    try {
      await deleteAppFn();
      await refresh();
      setMsg("Custom app removed. Reconnect to use the default site app.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#1DB954]/15 text-[#1DB954]">
            <Music2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold">Spotify stream tracking</h2>
            <p className="text-sm text-muted-foreground">
              Connect Spotify. Every full stream from a submitted Curator playlist earns 1 point. Works with free Spotify accounts — no Premium needed.
            </p>
          </div>
        </div>
        {status?.connected && (
          <div className="flex flex-col items-end gap-0.5 text-xs text-emerald-600">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" /> Connected
            </div>
            {status.spotifyUserId && (
              <div className="text-[11px] text-muted-foreground">
                as <span className="font-mono">@{status.spotifyUserId}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {status?.connected ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            Your points: <span className="font-semibold">{status.points}</span>
          </div>
          <Button
            type="button"
            variant={busy || (syncedAt && Date.now() - syncedAt < 2500) ? "success" : "default"}
            onClick={poll}
            disabled={busy}
            title="Automatic point updates are on; click to sync immediately"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : syncedAt && Date.now() - syncedAt < 2500 ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {busy ? "Syncing…" : syncedAt && Date.now() - syncedAt < 2500 ? "Synced" : "Sync now"}
          </Button>
          {autoActive ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <CheckCircle2 className="h-4 w-4" /> Auto update on
            </span>
          ) : (
            <span className="text-xs font-medium text-muted-foreground">Auto update off — press Sync now</span>
          )}
          <button
            onClick={disconnect}
            disabled={busy}
            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          disabled={busy}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#1DB954] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1AA34A] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music2 className="h-4 w-4" />}
          Connect Spotify
        </button>
      )}

      {msg && <p className="mt-3 text-xs text-muted-foreground">{msg}</p>}

      {status?.connected && (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Live activity</p>
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium ${
                autoActive ? "text-success" : "text-muted-foreground"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${autoActive ? "animate-pulse bg-success" : "bg-muted-foreground"}`}
              />
              {autoActive ? "Auto update on" : "Auto update off"}
            </span>
          </div>

          {autoActive && status.autoSyncUntil && (
            <p className="mt-1 text-xs text-muted-foreground">
              Started {new Date(new Date(status.autoSyncUntil).getTime() - AUTO_SYNC_WINDOW_MS).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              {" · "}stops at {new Date(status.autoSyncUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-xs text-muted-foreground">
              Today: <span className="font-semibold text-foreground">{status.todayTotal}</span> pts
            </span>
            {status.lastPlayAt && (
              <span className="text-xs text-muted-foreground">
                Last play {new Date(status.lastPlayAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
            {status.lastPolledAt && (
              <span className="text-xs text-muted-foreground">
                Last sync {new Date(status.lastPolledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
          </div>

          {status.hourly.length > 0 ? (
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              {status.hourly
                .slice()
                .reverse()
                .map((h) => (
                  <li key={h.hour} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {new Date(2000, 0, 1, h.hour).toLocaleTimeString([], { hour: "numeric" })}
                    </span>
                    <span className="font-semibold text-foreground">{h.count} pts</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              No streams counted yet today. Press Sync now, then play a Curator playlist.
            </p>
          )}
        </div>
      )}



      <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm">
        <p className="font-semibold text-foreground">How stream tracking works</p>
        <ol className="mt-2 ml-4 list-decimal space-y-1 text-muted-foreground">
          <li><b className="text-foreground">Press Sync now before you start streaming</b> a Curator playlist. This turns auto update on for your account.</li>
          <li>Play the Curator playlist from the playlist page on Spotify (not Liked Songs, search or radio).</li>
          <li>While you keep streaming the Curator playlist, your points update automatically every hour.</li>
          <li>If no Curator playlist plays are found for 2 hours, auto update turns off. Press Sync now again next time you stream.</li>
        </ol>
      </div>

      {/* Advanced: bring-your-own Spotify app */}
      <div className="mt-5 border-t border-border pt-4">
        <button
          type="button"
          onClick={toggleAppSetup}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="h-4 w-4" />
          Use your own Spotify app (skip the dev-mode user cap)
          <ChevronDown className={`h-4 w-4 transition ${showApp ? "rotate-180" : ""}`} />
        </button>

        {showApp && (
          <div className="mt-3 space-y-3 rounded-lg bg-muted/30 p-4 text-sm">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              <b className="text-foreground">No cap needed:</b> The site owner can request{" "}
              <b>Extended Quota</b> (free) from the{" "}
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Spotify Developer Dashboard
              </a>{" "}
              → Settings → Extended Quota Mode. Once approved, <b>any</b> Spotify user can connect — free or
              Premium — with no user cap at all. Until then, each user can also bring their own Spotify app below
              to connect immediately without waiting.
            </div>

            {status?.hasCustomApp ? (
              <>
                <p className="text-muted-foreground">
                  Using your own Spotify app.{" "}
                  <span className="font-mono text-xs">Client ID: {status.customClientId}</span>
                </p>
                <button
                  onClick={removeApp}
                  disabled={busy}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                >
                  Remove custom app
                </button>
              </>
            ) : (
              <>
                <p className="text-xs font-medium text-foreground">Bring your own Spotify app (no cap for you)</p>
                <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
                  <li>
                    A free Spotify account works. Go to{" "}
                    <a
                      href="https://developer.spotify.com/dashboard"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      developer.spotify.com/dashboard
                    </a>{" "}
                    and create an app.
                  </li>
                  <li>
                    Add this Redirect URI to the app settings:
                    <code className="mt-1 block break-all rounded bg-background px-2 py-1 font-mono text-[10px]">
                      {REDIRECT_URI_HINT}
                    </code>
                  </li>
                  <li>Under APIs used, check <b>Web API</b>. Save.</li>
                  <li>Copy the Client ID and Client Secret and paste them below.</li>
                </ol>
                <div className="space-y-2">
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="Client ID (32 hex chars)"
                    value={clientId}
                    onChange={(e) => {
                      const nextClientId = e.target.value;
                      setClientId(nextClientId);
                      if (nextClientId.trim()) {
                        window.localStorage.setItem("spotifyAppClientIdDraft", nextClientId);
                      } else {
                        window.localStorage.removeItem("spotifyAppClientIdDraft");
                      }
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono"
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Client Secret (32 hex chars)"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono"
                  />
                  <button
                    onClick={saveApp}
                    disabled={busy || !clientId.trim() || !clientSecret.trim()}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                    Save my Spotify app
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Your Client Secret is stored server-side and never sent back to the browser. Since you own the app,
                  you're auto-allowed — no development-mode user cap. Paste the Client ID first; it stays here if the tab refreshes.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

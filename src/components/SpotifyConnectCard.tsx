import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Music2, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import {
  getSpotifyAuthUrl,
  getMySpotifyStatus,
  pollSpotifyRecent,
  disconnectSpotify,
} from "@/lib/api/spotify.functions";

function spotifyPollMessage(result: { added?: number; error?: string | null }) {
  if (result.error === "spotify_account_not_allowed") {
    return "Spotify blocked tracking for this account because it is not added as an allowed user in the Spotify app settings.";
  }
  if (result.error) return `Spotify sync error: ${result.error}`;
  return result.added ? `+${result.added} new stream point${result.added === 1 ? "" : "s"}` : "Up to date";
}

export function SpotifyConnectCard() {
  const authUrlFn = useServerFn(getSpotifyAuthUrl);
  const statusFn = useServerFn(getMySpotifyStatus);
  const pollFn = useServerFn(pollSpotifyRecent);
  const disconnectFn = useServerFn(disconnectSpotify);

  const [status, setStatus] = useState<{
    connected: boolean;
    points: number;
    lastPolledAt: string | null;
    spotifyUserId: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
    void (async () => {
      const s = await refresh();
      if (s?.connected) {
        try {
          const r = await pollFn();
          if (r.error || (r.added && r.added > 0)) {
            setMsg(spotifyPollMessage(r));
            await refresh();
          }
        } catch {
          // ignore
        }
      }
    })();
    // Show flash from ?spotify=connected
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("spotify");
    if (flag === "connected") setMsg("Spotify connected!");
    else if (flag && flag !== "connected") setMsg(`Spotify error: ${flag}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const r = await pollFn();
      setMsg(spotifyPollMessage(r));
      await refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Poll failed");
    } finally {
      setBusy(false);
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
              Connect Spotify. Every full stream from a submitted Curator playlist earns 1 point.
            </p>
          </div>
        </div>
        {status?.connected && (
          <div className="flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Connected
          </div>
        )}
      </div>

      {status?.connected ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            Your points: <span className="font-semibold">{status.points}</span>
          </div>
          <button
            onClick={poll}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync now
          </button>
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
    </div>
  );
}

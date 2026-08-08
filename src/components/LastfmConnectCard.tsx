import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, CheckCircle2, Music2, ExternalLink } from "lucide-react";
import {
  setLastfmUsername,
  getLastfmStatus,
  disconnectLastfm,
} from "@/lib/api/lastfm.functions";

export function LastfmConnectCard() {
  const setFn = useServerFn(setLastfmUsername);
  const statusFn = useServerFn(getLastfmStatus);
  const disconnectFn = useServerFn(disconnectLastfm);

  const [status, setStatus] = useState<{
    connected: boolean;
    username: string | null;
    lastPolledAt: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const s = await statusFn();
      setStatus(s);
      if (s.username) setUsername(s.username);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const connect = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await setFn({ data: { username: username.trim() } });
      setMsg("Last.fm connected! Make sure Spotify scrobbling is turned on (see link below).");
      await refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to connect Last.fm");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectFn();
      setUsername("");
      setMsg("Last.fm disconnected");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#D51007]/15 text-[#D51007]">
            <Music2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold">Last.fm tracking (no user cap)</h2>
            <p className="text-sm text-muted-foreground">
              Connect Last.fm to track plays without Spotify's user limit. Works for free Spotify
              accounts — just enable scrobbling.
            </p>
          </div>
        </div>
        {status?.connected && (
          <div className="flex flex-col items-end gap-0.5 text-xs text-emerald-600">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" /> Connected
            </div>
            {status.username && (
              <div className="text-[11px] text-muted-foreground">
                as <span className="font-mono">@{status.username}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {status?.connected ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={disconnect}
            disabled={busy}
            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              autoComplete="off"
              placeholder="Your Last.fm username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && username.trim() && connect()}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={connect}
              disabled={busy || !username.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-[#D51007] px-4 py-2 text-sm font-semibold text-white hover:bg-[#B30D05] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music2 className="h-4 w-4" />}
              Connect
            </button>
          </div>

          <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">How to set up (one time, ~2 minutes):</p>
            <ol className="ml-4 mt-1 list-decimal space-y-0.5">
              <li>
                Create a free account at{" "}
                <a
                  href="https://www.last.fm/join"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  last.fm/join
                </a>
              </li>
              <li>
                Connect your Spotify account to Last.fm scrobbling:{" "}
                <a
                  href="https://www.last.fm/settings/connections"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline inline-flex items-center gap-0.5"
                >
                  last.fm/settings/connections
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>Enter your Last.fm username above and click Connect.</li>
            </ol>
            <p className="mt-2">
              Once scrobbling is on, every track you play on Spotify (free or Premium) is automatically
              sent to Last.fm — no user cap, no Spotify developer dashboard.
            </p>
          </div>
        </div>
      )}

      {msg && <p className="mt-3 text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

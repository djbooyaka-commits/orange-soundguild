import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { getRoomLastfmAccount, setRoomLastfmAccount } from "@/lib/api/lastfm.functions";

type Info = {
  roomId: string;
  roomUsername: string | null;
  defaultUsername: string | null;
  usesDefault: boolean;
  platform: string;
};

const PLATFORM_NAMES: Record<string, string> = {
  youtube: "YouTube",
  tidal: "Tidal",
  apple_music: "Apple Music",
  spotify: "Spotify",
};

const TIPS: Record<string, string> = {
  youtube:
    "YouTube doesn't send plays to Last.fm by itself. On a computer, install the free Web Scrobbler browser extension and sign it in to this Last.fm account. On a phone, use a scrobbler app.",
  tidal:
    "In the Tidal app, go to Settings → Last.fm and connect this Last.fm account so your plays are sent automatically.",
  apple_music:
    "Apple Music doesn't send plays to Last.fm by itself. On a computer, use the Web Scrobbler extension (music.apple.com) or a desktop scrobbler; on iPhone use a scrobbler app.",
  spotify:
    "On Last.fm, go to Settings → Applications and connect Spotify so your plays are sent automatically.",
  mixed:
    "Make sure the music app you use for this room sends its plays to this Last.fm account (a scrobbler).",
};

/**
 * The member's Last.fm account for this room. Spotify rooms fall back to the
 * default account; YouTube, Tidal and Apple Music rooms need their own,
 * and an account can only be used once on the site.
 */
export function RoomLastfmAccount({
  playlistId,
  roomId,
  tracking,
  onChanged,
  prominent = false,
}: {
  playlistId?: string;
  roomId?: string;
  tracking: boolean;
  onChanged?: () => void;
  prominent?: boolean;
}) {
  const getFn = useServerFn(getRoomLastfmAccount);
  const setFn = useServerFn(setRoomLastfmAccount);
  const [info, setInfo] = useState<Info | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getFn({ data: { playlistId, roomId } })
      .then((r) => alive && setInfo(r as Info))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, [playlistId, roomId, getFn]);

  if (!info) return null;

  const save = async (username: string) => {
    setSaving(true);
    setError(null);
    try {
      const r = await setFn({ data: { roomId: info.roomId, username } });
      setInfo((i) => (i ? { ...i, roomUsername: r.roomUsername } : i));
      setEditing(false);
      toast.success(
        r.roomUsername
          ? `This room now tracks Last.fm account ${r.roomUsername}`
          : info.usesDefault
            ? "This room now uses your default Last.fm account"
            : "Last.fm account removed from this room",
      );
      onChanged?.();
    } catch (e: any) {
      const msg = e?.message ?? "Could not save Last.fm account";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const fallback = info.usesDefault ? info.defaultUsername : null;
  const active = info.roomUsername ?? fallback;
  const platformName = PLATFORM_NAMES[info.platform];
  const tip = TIPS[info.platform] ?? TIPS.mixed;
  const stopFirst = tracking ? "Stop tracking first" : undefined;
  const btn =
    "rounded-md border border-border px-2 py-1 font-medium hover:border-primary hover:text-primary disabled:opacity-50";

  return (
    <div
      className={
        prominent
          ? "rounded-xl border border-border bg-card p-5 text-sm"
          : "mt-3 rounded-lg border border-border bg-muted/30 p-3 text-xs"
      }
    >
      {prominent && (
        <h2 className="mb-2 flex items-center gap-2 font-semibold">
          <Radio className="h-4 w-4 text-primary" />
          Last.fm account for this room
          {platformName && info.platform !== "spotify" && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              {platformName}
            </span>
          )}
        </h2>
      )}
      {!editing ? (
        <div className="flex flex-wrap items-center gap-2">
          {!prominent && <span className="text-muted-foreground">Last.fm account for this room:</span>}
          {active ? (
            <span className="font-semibold text-foreground">{active}</span>
          ) : (
            <span className="font-medium text-muted-foreground">
              No Last.fm account connected for this room
            </span>
          )}
          {info.roomUsername ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              This room only
            </span>
          ) : active ? (
            <span className="text-muted-foreground">(your default)</span>
          ) : null}
          <button
            type="button"
            disabled={tracking || saving}
            onClick={() => {
              setValue(info.roomUsername ?? "");
              setError(null);
              setEditing(true);
            }}
            className={active ? btn : "rounded-md bg-primary px-2 py-1 font-semibold text-primary-foreground disabled:opacity-50"}
            title={stopFirst}
          >
            {active ? "Use a different account here" : "Connect a Last.fm account"}
          </button>
          {info.roomUsername && (
            <button
              type="button"
              disabled={tracking || saving}
              onClick={() => save("")}
              className={btn}
              title={stopFirst}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : info.usesDefault && info.defaultUsername ? (
                "Use my default"
              ) : (
                "Remove"
              )}
            </button>
          )}
          {tracking && <span className="text-muted-foreground">Stop tracking to change it.</span>}
        </div>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) save(value.trim());
          }}
        >
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="New Last.fm username for this room"
            maxLength={50}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1"
          />
          <button
            type="submit"
            disabled={saving || !value.trim()}
            className="rounded-md bg-primary px-2 py-1 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className={btn}>
            Cancel
          </button>
        </form>
      )}
      {error && <p className="mt-2 font-medium text-destructive">{error}</p>}
      <p className="mt-2 text-muted-foreground">
        {info.usesDefault
          ? "A room-only account must be a new Last.fm account that isn't used anywhere else on the site."
          : "This room doesn't use your default account. Connect a new Last.fm account that isn't used anywhere else on the site."}
      </p>
      {prominent && <p className="mt-2 text-muted-foreground">{tip}</p>}
    </div>
  );
}

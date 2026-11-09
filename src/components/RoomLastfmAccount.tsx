import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getRoomLastfmAccount, setRoomLastfmAccount } from "@/lib/api/lastfm.functions";

/**
 * Lets a member use a different Last.fm account in this room only
 * (e.g. one for YouTube). Other rooms keep the default account.
 */
export function RoomLastfmAccount({
  playlistId,
  tracking,
  onChanged,
}: {
  playlistId: string;
  tracking: boolean;
  onChanged: () => void;
}) {
  const getFn = useServerFn(getRoomLastfmAccount);
  const setFn = useServerFn(setRoomLastfmAccount);
  const [info, setInfo] = useState<{ roomUsername: string | null; defaultUsername: string | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getFn({ data: { playlistId } })
      .then((r) => alive && setInfo(r))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, [playlistId, getFn]);

  if (!info) return null;

  const save = async (username: string) => {
    setSaving(true);
    try {
      const r = await setFn({ data: { playlistId, username } });
      setInfo((i) => (i ? { ...i, roomUsername: r.roomUsername } : i));
      setEditing(false);
      toast.success(
        r.roomUsername
          ? `This room now tracks Last.fm account ${r.roomUsername}`
          : "This room now uses your default Last.fm account",
      );
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save Last.fm account");
    } finally {
      setSaving(false);
    }
  };

  const active = info.roomUsername ?? info.defaultUsername;

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-xs">
      {!editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Last.fm account for this room:</span>
          <span className="font-semibold text-foreground">{active ?? "none"}</span>
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
              setEditing(true);
            }}
            className="rounded-md border border-border px-2 py-1 font-medium hover:border-primary hover:text-primary disabled:opacity-50"
            title={tracking ? "Stop tracking first" : undefined}
          >
            Use a different account here
          </button>
          {info.roomUsername && (
            <button
              type="button"
              disabled={tracking || saving}
              onClick={() => save("")}
              className="rounded-md border border-border px-2 py-1 font-medium hover:border-primary hover:text-primary disabled:opacity-50"
              title={tracking ? "Stop tracking first" : undefined}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Use my default"}
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
            placeholder="Last.fm username for this room"
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
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-border px-2 py-1 font-medium"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

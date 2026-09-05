import { publicOrigin } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Copy, Check, X, Loader2, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { listMyCuratorInvitees, cancelCuratorInvite } from "@/lib/api/curator-invites.functions";
import { curatorAdjustPlaylistPoints, listMyCuratorPlaylists } from "@/lib/api/curator.functions";
import { signMany } from "@/lib/signMedia";
import defaultAvatar from "@/assets/avatar.jpg";


type Invitee = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  avatar_signed?: string | null;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

export function CuratorInviteManager() {
  const { user } = useAuth();
  const listFn = useServerFn(listMyCuratorInvitees);
  const cancelFn = useServerFn(cancelCuratorInvite);
  const playlistsFn = useServerFn(listMyCuratorPlaylists);
  const adjustFn = useServerFn(curatorAdjustPlaylistPoints);

  const [items, setItems] = useState<Invitee[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playlists, setPlaylists] = useState<Array<{ id: string; name: string }>>([]);
  const [playlistId, setPlaylistId] = useState("");
  const [pointInputs, setPointInputs] = useState<Record<string, string>>({});
  const [adjustingId, setAdjustingId] = useState<string | null>(null);


  const inviteUrl = useMemo(() => {
    if (!user) return "";
    return `${publicOrigin()}/curator?invite=${user.id}`;
  }, [user]);

  const refresh = async () => {
    const rows = ((await listFn()) ?? []) as Invitee[];
    const signed = await signMany(
      rows.map((i) => ({ bucket: "avatars" as const, path: i.avatar_url })),
    );
    setItems(rows.map((i, idx) => ({ ...i, avatar_signed: signed[idx] ?? null })));
  };

  useEffect(() => {
    void refresh();
    void (async () => {
      try {
        const rows = ((await playlistsFn()) ?? []) as Array<{
          id: string;
          name: string;
          is_osg?: boolean | null;
        }>;
        const usable = rows.filter((p) => !p.is_osg).map((p) => ({ id: p.id, name: p.name }));
        setPlaylists(usable);
        setPlaylistId((cur) => cur || (usable[0]?.id ?? ""));
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adjust = async (userId: string, sign: 1 | -1) => {
    const n = Math.abs(Math.trunc(Number(pointInputs[userId] ?? "")));
    if (!playlistId) {
      toast.error("Pick a playlist first");
      return;
    }
    if (!n) {
      toast.error("Enter a number of points");
      return;
    }
    setAdjustingId(userId);
    try {
      const res = await adjustFn({
        data: { playlistId, userId, delta: sign * n },
      });
      setPointInputs((s) => ({ ...s, [userId]: "" }));
      toast.success(
        `${sign > 0 ? "Added" : "Removed"} ${n} pts · now ${res.balance} pts on this playlist`,
      );
    } catch (err: any) {
      toast.error(err?.message ?? "Could not change points");
    } finally {
      setAdjustingId(null);
    }
  };


  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const cancel = async (id: string) => {
    setBusy(true);
    try {
      await cancelFn({ data: { inviteId: id } });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Link2 className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold">Your invite link</h2>
          <p className="text-sm text-muted-foreground">
            Share this link. Anyone who opens it and signs in will be tracked when they stream your
            playlists. New users are prompted to join the site first.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={inviteUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <h3 className="mt-6 text-sm font-semibold">Tracked users</h3>
      <ul className="mt-2 space-y-2">
        {items.length === 0 && (
          <li className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No one has joined your link yet.
          </li>
        )}
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 rounded-md border border-border p-3">
            <img
              src={i.avatar_signed ?? defaultAvatar}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
              onError={(e) => {
                e.currentTarget.src = defaultAvatar;
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">@{i.username}</p>
              <p className="text-xs capitalize text-muted-foreground">{i.status}</p>
            </div>
            <button
              onClick={() => cancel(i.id)}
              disabled={busy}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
              aria-label="Remove"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus, Loader2, X, Check, Clock } from "lucide-react";
import {
  inviteCuratorUser,
  listMyCuratorInvitees,
  cancelCuratorInvite,
} from "@/lib/api/curator-invites.functions";

type Invitee = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

export function CuratorInviteManager() {
  const inviteFn = useServerFn(inviteCuratorUser);
  const listFn = useServerFn(listMyCuratorInvitees);
  const cancelFn = useServerFn(cancelCuratorInvite);

  const [items, setItems] = useState<Invitee[]>([]);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => setItems((await listFn()) as Invitee[]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await inviteFn({ data: { username: username.trim() } });
      setMsg(`Invited @${username.trim()}`);
      setUsername("");
      await refresh();
    } catch (ex: any) {
      setErr(ex?.message ?? "Failed to invite user");
    } finally {
      setBusy(false);
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

  const statusBadge = (s: Invitee["status"]) => {
    if (s === "accepted")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600 dark:text-green-400">
          <Check className="h-3 w-3" /> Accepted
        </span>
      );
    if (s === "declined")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
          <X className="h-3 w-3" /> Declined
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" /> Pending
      </span>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserPlus className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold">Invite users to track</h2>
          <p className="text-sm text-muted-foreground">
            Only invited users' streams of your playlists count for points.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !username.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Send invite
        </button>
      </form>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}

      <ul className="mt-4 space-y-2">
        {items.length === 0 && (
          <li className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No invitations yet.
          </li>
        )}
        {items.map((i) => (
          <li
            key={i.id}
            className="flex items-center gap-3 rounded-md border border-border p-3"
          >
            {i.avatar_url ? (
              <img src={i.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">@{i.username}</p>
              <div className="mt-0.5">{statusBadge(i.status)}</div>
            </div>
            <button
              onClick={() => cancel(i.id)}
              disabled={busy}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
              aria-label="Remove invite"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

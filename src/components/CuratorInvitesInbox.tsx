import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mail, Check, X, Loader2 } from "lucide-react";
import {
  listCuratorInvitesForMe,
  respondCuratorInvite,
} from "@/lib/api/curator-invites.functions";

type Invite = {
  id: string;
  curator_id: string;
  curator_username: string;
  curator_avatar: string | null;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

export function CuratorInvitesInbox() {
  const listFn = useServerFn(listCuratorInvitesForMe);
  const respondFn = useServerFn(respondCuratorInvite);
  const [items, setItems] = useState<Invite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => setItems((await listFn()) as Invite[]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const respond = async (id: string, accept: boolean) => {
    setBusy(id);
    try {
      await respondFn({ data: { inviteId: id, accept } });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Mail className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold">Curator invitations</h2>
          <p className="text-sm text-muted-foreground">
            Accept to start earning points for streaming this curator's playlists.
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 rounded-md border border-border p-3">
            {i.curator_avatar ? (
              <img src={i.curator_avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">@{i.curator_username}</p>
              <p className="text-xs capitalize text-muted-foreground">{i.status}</p>
            </div>
            {i.status === "pending" && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => respond(i.id, true)}
                  disabled={busy === i.id}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy === i.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Accept
                </button>
                <button
                  onClick={() => respond(i.id, false)}
                  disabled={busy === i.id}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                  Decline
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

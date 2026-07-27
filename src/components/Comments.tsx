import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle, Send, Reply, Pencil, X, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { signMany, signOne } from "@/lib/signMedia";

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  parent_id: string | null;
  edited_at: string | null;
};

type Profile = { username: string | null; avatar_url: string | null };

export function Comments({ trackId, title }: { trackId: string; title: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const ensureProfile = async (uid: string) => {
    if (profiles[uid]) return;
    const { data: p } = await supabase
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", uid)
      .maybeSingle();
    if (p) {
      const url = await signOne("avatars", p.avatar_url);
      setProfiles((prev) => ({ ...prev, [uid]: { username: p.username, avatar_url: url } }));
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("comments")
        .select("id, body, created_at, user_id, parent_id, edited_at")
        .eq("track_id", trackId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      const rows = (data ?? []) as CommentRow[];
      setComments(rows);
      setLoading(false);

      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      if (ids.length) {
        const { data: pData } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", ids);
        if (cancelled) return;
        const rows2 = pData ?? [];
        const signed = await signMany(
          rows2.map((p) => ({ bucket: "avatars" as const, path: p.avatar_url })),
        );
        if (cancelled) return;
        const map: Record<string, Profile> = {};
        rows2.forEach((p, i) => {
          map[p.id] = { username: p.username, avatar_url: signed[i] };
        });
        setProfiles((prev) => ({ ...prev, ...map }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const { roots, childrenByParent } = useMemo(() => {
    const roots: CommentRow[] = [];
    const childrenByParent: Record<string, CommentRow[]> = {};
    for (const c of comments) {
      if (c.parent_id) {
        (childrenByParent[c.parent_id] ??= []).push(c);
      } else {
        roots.push(c);
      }
    }
    // replies chronological
    Object.values(childrenByParent).forEach((arr) =>
      arr.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    );
    return { roots, childrenByParent };
  }, [comments]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Sign in to comment");
      return;
    }
    const body = text.trim();
    if (!body) return;
    setPosting(true);
    const { data, error } = await supabase
      .from("comments")
      .insert({ track_id: trackId, user_id: user.id, body })
      .select("id, body, created_at, user_id, parent_id, edited_at")
      .single();
    setPosting(false);
    if (error) {
      toast.error("Couldn't post comment");
      return;
    }
    setText("");
    setComments((prev) => [data as CommentRow, ...prev]);
    await ensureProfile(user.id);
  };

  const submitReply = async (parentId: string) => {
    if (!user) {
      toast.error("Sign in to reply");
      return;
    }
    const body = replyText.trim();
    if (!body) return;
    const { data, error } = await supabase
      .from("comments")
      .insert({ track_id: trackId, user_id: user.id, body, parent_id: parentId })
      .select("id, body, created_at, user_id, parent_id, edited_at")
      .single();
    if (error) {
      toast.error("Couldn't post reply");
      return;
    }
    setReplyText("");
    setReplyTo(null);
    setComments((prev) => [...prev, data as CommentRow]);
    await ensureProfile(user.id);
  };

  const saveEdit = async (id: string) => {
    const body = editText.trim();
    if (!body) return;
    const editedAt = new Date().toISOString();
    const { error } = await supabase
      .from("comments")
      .update({ body, edited_at: editedAt })
      .eq("id", id);
    if (error) {
      toast.error("Couldn't save edit");
      return;
    }
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, body, edited_at: editedAt } : c)),
    );
    setEditingId(null);
    setEditText("");
  };

  const deleteComment = async (id: string) => {
    if (!window.confirm("Delete this comment?")) return;
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) {
      toast.error("Couldn't delete");
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== id && c.parent_id !== id));
  };

  const renderComment = (c: CommentRow, isReply = false) => {
    const p = profiles[c.user_id];
    const name = p?.username ?? "user";
    const isMine = user?.id === c.user_id;
    const isEditing = editingId === c.id;
    return (
      <li key={c.id} className={`flex gap-3 ${isReply ? "ml-11" : ""}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
          {p?.avatar_url ? (
            <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            name.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{name}</span>
            <span className="text-[11px] text-muted-foreground">
              {new Date(c.created_at).toLocaleString()}
              {c.edited_at ? " · edited" : ""}
            </span>
          </div>
          {isEditing ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                maxLength={1000}
                autoFocus
                className="flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                onClick={() => saveEdit(c.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
                aria-label="Save edit"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setEditingId(null);
                  setEditText("");
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border"
                aria-label="Cancel edit"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
              {c.body}
            </p>
          )}

          {!isEditing && (
            <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
              {!isReply && user && (
                <button
                  onClick={() => {
                    setReplyTo(replyTo === c.id ? null : c.id);
                    setReplyText("");
                  }}
                  className="inline-flex items-center gap-1 hover:text-primary"
                >
                  <Reply className="h-3 w-3" /> Reply
                </button>
              )}
              {isMine && (
                <>
                  <button
                    onClick={() => {
                      setEditingId(c.id);
                      setEditText(c.body);
                    }}
                    className="inline-flex items-center gap-1 hover:text-primary"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={() => deleteComment(c.id)}
                    className="inline-flex items-center gap-1 hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </>
              )}
            </div>
          )}

          {replyTo === c.id && !isReply && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitReply(c.id);
              }}
              className="mt-2 flex gap-2"
            >
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to ${name}…`}
                autoFocus
                maxLength={1000}
                className="flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="submit"
                disabled={!replyText.trim()}
                className="inline-flex h-8 items-center justify-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                Reply
              </button>
            </form>
          )}

          {!isReply && childrenByParent[c.id]?.length ? (
            <ul className="mt-3 space-y-3">
              {childrenByParent[c.id].map((r) => renderComment(r, true))}
            </ul>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <section className="mt-10 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <header className="mb-4 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">
          Comments on <span className="text-primary">{title}</span>
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">{comments.length}</span>
      </header>

      <form onSubmit={submit} className="mb-5 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={user ? "Drop a comment…" : "Sign in to comment"}
          disabled={!user || posting}
          maxLength={1000}
          className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!user || posting || !text.trim()}
          className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:opacity-50"
          aria-label="Post comment"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading comments…</p>
      ) : roots.length === 0 ? (
        <p className="text-sm text-muted-foreground">Be the first to comment.</p>
      ) : (
        <ul className="space-y-4">{roots.map((c) => renderComment(c))}</ul>
      )}
    </section>
  );
}

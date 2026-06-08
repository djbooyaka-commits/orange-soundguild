import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  author?: { username: string | null; avatar_url: string | null } | null;
};

export function Comments({ trackId, title }: { trackId: string; title: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id, body, created_at, user_id, author:profiles!comments_user_id_fkey(username, avatar_url)")
        .eq("track_id", trackId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) {
        // profile join may fail if FK missing; fall back to a plain select
        const { data: plain } = await supabase
          .from("comments")
          .select("id, body, created_at, user_id")
          .eq("track_id", trackId)
          .order("created_at", { ascending: false })
          .limit(50);
        setComments((plain ?? []) as CommentRow[]);
      } else {
        setComments((data ?? []) as unknown as CommentRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [trackId]);

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
      .select("id, body, created_at, user_id")
      .single();
    setPosting(false);
    if (error) {
      toast.error("Couldn't post comment");
      return;
    }
    setText("");
    setComments((prev) => [data as CommentRow, ...prev]);
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
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Be the first to comment.</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                {c.author?.avatar_url ? (
                  <img src={c.author.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  (c.author?.username ?? "U").slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold">
                    {c.author?.username ?? "user"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(c.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

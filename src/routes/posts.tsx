import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";
import defaultAvatar from "@/assets/avatar.jpg";
import { Send, Trash2, Clock, Heart } from "lucide-react";

export const Route = createFileRoute("/posts")({
  head: () => ({
    meta: [
      { title: "Public Posts — Orange Sound Guild" },
      { name: "description", content: "Short public posts from the Orange Sound Guild community. Posts disappear after 7 days." },
      { property: "og:title", content: "Public Posts on Orange Sound Guild" },
      { property: "og:description", content: "Share short posts with the community. Every post auto-expires after 7 days." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PostsPage,
});

type PostRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  expires_at: string;
  parent_id: string | null;
};

const URL_RE = /((?:https?:\/\/|www\.)[^\s]+)/gi;

function hasLink(text: string): boolean {
  return /(https?:\/\/|www\.)[^\s]+/i.test(text);
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (URL_RE.test(part)) {
          URL_RE.lastIndex = 0;
          const href = part.startsWith("http") ? part : `https://${part}`;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="break-all text-primary underline underline-offset-2 hover:brightness-110"
            >
              {part}
            </a>
          );
        }
        URL_RE.lastIndex = 0;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

type Author = {
  username: string | null;
  avatar_url: string | null;
};

const MAX_LEN = 280;
const SIGNED_TTL = 60 * 60 * 24 * 7;

async function resolveAvatar(value: string | null | undefined): Promise<string> {
  if (!value) return defaultAvatar;
  if (value.startsWith("http")) return value;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(value, SIGNED_TTL);
  return data?.signedUrl ?? defaultAvatar;
}

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtExpires(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / (1000 * 60 * 60));
  if (h < 24) return `expires in ${h}h`;
  const d = Math.floor(h / 24);
  return `expires in ${d}d`;
}

function PostsPage() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author & { avatarSigned: string }>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAuthors = async (rows: PostRow[]) => {
    const missing = Array.from(new Set(rows.map((r) => r.user_id))).filter((id) => !authors[id]);
    if (missing.length === 0) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", missing);
    if (!data) return;
    const next: Record<string, Author & { avatarSigned: string }> = {};
    await Promise.all(
      data.map(async (p) => {
        next[p.id] = {
          username: p.username,
          avatar_url: p.avatar_url,
          avatarSigned: await resolveAvatar(p.avatar_url),
        };
      }),
    );
    setAuthors((prev) => ({ ...prev, ...next }));
  };

  const loadLikes = async (rows: PostRow[], uid: string | null) => {
    if (rows.length === 0) return;
    const ids = rows.map((r) => r.id);
    const { data } = await supabase
      .from("post_likes")
      .select("post_id, user_id")
      .in("post_id", ids);
    if (!data) return;
    const counts: Record<string, number> = {};
    const mine = new Set<string>();
    for (const row of data) {
      counts[row.post_id] = (counts[row.post_id] ?? 0) + 1;
      if (uid && row.user_id === uid) mine.add(row.post_id);
    }
    setLikeCounts((prev) => ({ ...prev, ...counts }));
    setMyLikes((prev) => {
      const next = new Set(prev);
      mine.forEach((id) => next.add(id));
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id, user_id, body, created_at, expires_at, parent_id")
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      setPosts(data ?? []);
      setLoading(false);
      await Promise.all([loadAuthors(data ?? []), loadLikes(data ?? [], user?.id ?? null)]);
    })();

    const ch = supabase
      .channel("posts-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        (payload) => {
          const row = payload.new as PostRow;
          setPosts((prev) => (prev.some((p) => p.id === row.id) ? prev : [row, ...prev]));
          loadAuthors([row]);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "posts" },
        (payload) => {
          const oldRow = payload.old as { id: string };
          setPosts((prev) => prev.filter((p) => p.id !== oldRow.id));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "post_likes" },
        (payload) => {
          const row = payload.new as { post_id: string; user_id: string };
          setLikeCounts((prev) => ({ ...prev, [row.post_id]: (prev[row.post_id] ?? 0) + 1 }));
          if (user && row.user_id === user.id) {
            setMyLikes((prev) => new Set(prev).add(row.post_id));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "post_likes" },
        (payload) => {
          const row = payload.old as { post_id: string; user_id: string };
          setLikeCounts((prev) => ({
            ...prev,
            [row.post_id]: Math.max(0, (prev[row.post_id] ?? 1) - 1),
          }));
          if (user && row.user_id === user.id) {
            setMyLikes((prev) => {
              const next = new Set(prev);
              next.delete(row.post_id);
              return next;
            });
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const remaining = MAX_LEN - body.length;
  const canPost = user && body.trim().length > 0 && body.length <= MAX_LEN && !posting;

  const submit = async () => {
    if (!user) return;
    const text = body.trim();
    if (!text) return;
    setPosting(true);
    const { error } = await supabase.from("posts").insert({ user_id: user.id, body: text });
    setPosting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setBody("");
  };

  const submitReply = async (parentId: string) => {
    if (!user) return;
    const text = replyBody.trim();
    if (!text) return;
    setReplying(true);
    const { error } = await supabase
      .from("posts")
      .insert({ user_id: user.id, body: text, parent_id: parentId });
    setReplying(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setReplyBody("");
    setReplyTo(null);
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  const toggleLike = async (postId: string) => {
    if (!user) {
      toast.error("Sign in to like posts.");
      return;
    }
    const liked = myLikes.has(postId);
    // optimistic
    setMyLikes((prev) => {
      const next = new Set(prev);
      if (liked) next.delete(postId);
      else next.add(postId);
      return next;
    });
    setLikeCounts((prev) => ({
      ...prev,
      [postId]: Math.max(0, (prev[postId] ?? 0) + (liked ? -1 : 1)),
    }));
    if (liked) {
      const { error } = await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("post_likes")
        .insert({ post_id: postId, user_id: user.id });
      if (error && !/duplicate/i.test(error.message)) toast.error(error.message);
    }
  };

  const repliesByParent = useMemo(() => {
    const map: Record<string, PostRow[]> = {};
    for (const p of posts) {
      if (!p.parent_id) continue;
      if (new Date(p.expires_at).getTime() <= Date.now()) continue;
      (map[p.parent_id] ??= []).push(p);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    return map;
  }, [posts]);

  const visible = useMemo(() => {
    const alive = posts.filter(
      (p) => !p.parent_id && new Date(p.expires_at).getTime() > Date.now(),
    );
    return alive.slice().sort((a, b) => {
      const la = likeCounts[a.id] ?? 0;
      const lb = likeCounts[b.id] ?? 0;
      if (lb !== la) return lb - la;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [posts, likeCounts]);

  return (
    <div className="min-h-screen bg-background pb-40">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Community Posts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Share short public posts. Every post disappears after 7 days.
          </p>
        </div>

        {user ? (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX_LEN))}
              placeholder="What's happening?"
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <div className="mt-2 flex items-center justify-between">
              <span
                className={`text-xs ${remaining < 20 ? "text-destructive" : "text-muted-foreground"}`}
              >
                {remaining} left · auto-deletes in {hasLink(body) ? 8 : 7} days
              </span>
              <button
                onClick={submit}
                disabled={!canPost}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105 disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> {posting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            <Link to="/auth" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>{" "}
            to share a post.
          </div>
        )}

        <div className="mt-6 space-y-3">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No posts yet. Be the first!
            </p>
          ) : (
            visible.map((p) => {
              const author = authors[p.user_id];
              const name = author?.username ?? "user";
              const canDelete = user && (user.id === p.user_id || isAdmin);
              return (
                <article
                  key={p.id}
                  className="flex gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <Link to="/u/$handle" params={{ handle: name }} className="shrink-0">
                    <img
                      src={author?.avatarSigned ?? defaultAvatar}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Link
                        to="/u/$handle"
                        params={{ handle: name }}
                        className="truncate font-semibold hover:underline"
                      >
                        @{name}
                      </Link>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{fmtRelative(p.created_at)}</span>
                      <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> {fmtExpires(p.expires_at)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{p.body}</p>
                    <div className="mt-2 flex items-center gap-1">
                      <button
                        onClick={() => toggleLike(p.id)}
                        aria-pressed={myLikes.has(p.id)}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                          myLikes.has(p.id)
                            ? "text-rose-500 hover:bg-rose-500/10"
                            : "text-muted-foreground hover:bg-muted hover:text-rose-500"
                        }`}
                      >
                        <Heart
                          className={`h-3.5 w-3.5 ${myLikes.has(p.id) ? "fill-current" : ""}`}
                        />
                        {likeCounts[p.id] ?? 0}
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => remove(p.id)}
                          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}

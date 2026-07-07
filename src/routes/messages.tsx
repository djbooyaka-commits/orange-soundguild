import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Send, Check, X, MessageCircle, Loader2, ImagePlus, Video } from "lucide-react";

const VIDEO_EXTS = ["mp4", "webm", "mov", "m4v", "ogg"];
const MAX_VIDEO_SECONDS = 20;
const isVideoPath = (p: string) => {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTS.includes(ext);
};
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import defaultAvatar from "@/assets/avatar.jpg";

export const Route = createFileRoute("/messages")({
  validateSearch: z.object({ with: z.string().uuid().optional() }),
  head: () => ({
    meta: [
      { title: "Messages — Orange Sound Guild" },
      { name: "description", content: "Chat with your friends on Orange Sound Guild." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MessagesPage,
});

type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

type ProfileMini = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
  read_at: string | null;
};

const SIGNED_TTL = 60 * 60 * 24;

async function resolveAvatar(v: string | null | undefined): Promise<string> {
  if (!v) return defaultAvatar;
  if (v.startsWith("http")) return v;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(v, SIGNED_TTL);
  return data?.signedUrl ?? defaultAvatar;
}

function MessagesPage() {
  const { user, loading } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileMini & { avatar_signed: string }>>({});
  const [activeId, setActiveId] = useState<string | null>(search.with ?? null);

  // Load friendships + profiles
  const loadAll = async () => {
    if (!user) return;
    const { data: fs } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status, created_at")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .order("created_at", { ascending: false });
    const rows = (fs ?? []) as Friendship[];
    setFriendships(rows);
    const otherIds = Array.from(
      new Set(rows.map((r) => (r.requester_id === user.id ? r.addressee_id : r.requester_id))),
    );
    if (otherIds.length > 0) {
      const { data: ps } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", otherIds);
      const list = (ps ?? []) as ProfileMini[];
      const next: Record<string, ProfileMini & { avatar_signed: string }> = {};
      await Promise.all(
        list.map(async (p) => {
          next[p.id] = { ...p, avatar_signed: await resolveAvatar(p.avatar_url) };
        }),
      );
      setProfiles(next);
    }
  };

  useEffect(() => {
    if (!loading && user) void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loading]);

  // Realtime friendships
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`friendships:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => void loadAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const accepted = useMemo(
    () => friendships.filter((f) => f.status === "accepted"),
    [friendships],
  );
  const incoming = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.addressee_id === user?.id),
    [friendships, user?.id],
  );
  const outgoing = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.requester_id === user?.id),
    [friendships, user?.id],
  );

  // Ensure active friend is a real accepted one
  useEffect(() => {
    if (!user) return;
    if (search.with && accepted.some((f) => otherOf(f, user.id) === search.with)) {
      setActiveId(search.with);
    } else if (!activeId && accepted.length > 0) {
      setActiveId(otherOf(accepted[0], user.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accepted, search.with, user?.id]);

  const respond = async (id: string, next: "accepted" | "declined") => {
    if (next === "declined") {
      const { error } = await supabase.from("friendships").delete().eq("id", id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("friendships").update({ status: next }).eq("id", id);
      if (error) return toast.error(error.message);
    }
    void loadAll();
  };

  if (!loading && !user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="mx-auto max-w-2xl px-4 py-24 text-center">
          <h1 className="text-3xl font-bold">Sign in to message friends</h1>
          <Link
            to="/auth"
            className="mt-6 inline-flex h-10 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
          >
            Sign in
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-40">
      <Navbar />
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-8 sm:px-6 md:grid-cols-[320px_1fr]">
        {/* Sidebar */}
        <aside className="space-y-6">
          {incoming.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Requests
              </h2>
              <ul className="space-y-2">
                {incoming.map((f) => {
                  const p = profiles[f.requester_id];
                  return (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                    >
                      <img
                        src={p?.avatar_signed ?? defaultAvatar}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1 text-sm font-medium truncate">
                        {p?.username ?? "user"}
                      </div>
                      <button
                        onClick={() => respond(f.id, "accepted")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white hover:brightness-110"
                        aria-label="Accept"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => respond(f.id, "declined")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background hover:bg-muted"
                        aria-label="Decline"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Friends
            </h2>
            {accepted.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
                You have no friends yet. Visit a profile and hit “Add friend”.
              </p>
            ) : (
              <ul className="space-y-1">
                {accepted.map((f) => {
                  const otherId = otherOf(f, user!.id);
                  const p = profiles[otherId];
                  const active = activeId === otherId;
                  return (
                    <li key={f.id}>
                      <button
                        onClick={() => {
                          setActiveId(otherId);
                          navigate({ to: "/messages", search: { with: otherId } });
                        }}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                          active ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted"
                        }`}
                      >
                        <img
                          src={p?.avatar_signed ?? defaultAvatar}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {p?.username ?? "user"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {outgoing.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pending
              </h2>
              <ul className="space-y-2">
                {outgoing.map((f) => {
                  const p = profiles[f.addressee_id];
                  return (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm"
                    >
                      <img
                        src={p?.avatar_signed ?? defaultAvatar}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1 truncate">{p?.username ?? "user"}</div>
                      <span className="text-xs text-muted-foreground">waiting</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </aside>

        {/* Chat pane */}
        <section className="min-h-[70vh] rounded-2xl border border-border bg-card">
          {activeId ? (
            <ChatPane
              key={activeId}
              me={user!.id}
              other={profiles[activeId] ?? { id: activeId, username: null, avatar_url: null, avatar_signed: defaultAvatar }}
            />
          ) : (
            <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
              <MessageCircle className="h-10 w-10" />
              <p className="text-sm">Select a friend to start chatting.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function otherOf(f: Friendship, me: string) {
  return f.requester_id === me ? f.addressee_id : f.requester_id;
}

function ChatPane({
  me,
  other,
}: {
  me: string;
  other: ProfileMini & { avatar_signed: string };
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("direct_messages")
      .select("id, sender_id, recipient_id, body, image_url, created_at, read_at")
      .or(
        `and(sender_id.eq.${me},recipient_id.eq.${other.id}),` +
          `and(sender_id.eq.${other.id},recipient_id.eq.${me})`,
      )
      .order("created_at", { ascending: true })
      .limit(500);
    setMessages((data ?? []) as Message[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, other.id]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`dm:${me}:${other.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const m = payload.new as Message;
          const involves =
            (m.sender_id === me && m.recipient_id === other.id) ||
            (m.sender_id === other.id && m.recipient_id === me);
          if (!involves) return;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [me, other.id]);

  // Sign image URLs as they come in
  useEffect(() => {
    const needed = messages
      .map((m) => m.image_url)
      .filter((p): p is string => !!p && !imageUrls[p]);
    if (needed.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        needed.map(async (path) => {
          const { data } = await supabase.storage
            .from("chat-images")
            .createSignedUrl(path, 60 * 60 * 24);
          return [path, data?.signedUrl ?? ""] as const;
        }),
      );
      if (cancelled) return;
      setImageUrls((prev) => {
        const next = { ...prev };
        for (const [p, u] of entries) if (u) next[p] = u;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, imageUrls]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // Mark incoming as read
  useEffect(() => {
    const unread = messages.filter((m) => m.recipient_id === me && !m.read_at).map((m) => m.id);
    if (unread.length === 0) return;
    void supabase
      .from("direct_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unread);
  }, [messages, me]);

  const pickFile = async (f: File | null) => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    if (!f) {
      setPendingFile(null);
      setPendingPreview(null);
      return;
    }
    const isImg = f.type.startsWith("image/");
    const isVid = f.type.startsWith("video/");
    if (!isImg && !isVid) {
      toast.error("Please pick an image or video file.");
      return;
    }
    const maxBytes = isVid ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (f.size > maxBytes) {
      toast.error(isVid ? "Video is too large (max 50MB)." : "Image is too large (max 10MB).");
      return;
    }
    if (isVid) {
      const url = URL.createObjectURL(f);
      const duration = await new Promise<number>((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => resolve(v.duration || 0);
        v.onerror = () => resolve(0);
        v.src = url;
      });
      if (!duration || duration > MAX_VIDEO_SECONDS + 0.5) {
        URL.revokeObjectURL(url);
        toast.error(`Videos must be ${MAX_VIDEO_SECONDS} seconds or less.`);
        return;
      }
      setPendingFile(f);
      setPendingPreview(url);
      return;
    }
    setPendingFile(f);
    setPendingPreview(URL.createObjectURL(f));
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = input.trim();
    if ((!body && !pendingFile) || sending) return;
    setSending(true);

    let imagePath: string | null = null;
    if (pendingFile) {
      const ext = (pendingFile.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${me}/${crypto.randomUUID()}.${ext || "jpg"}`;
      const { error: upErr } = await supabase.storage
        .from("chat-images")
        .upload(path, pendingFile, { contentType: pendingFile.type, upsert: false });
      if (upErr) {
        setSending(false);
        return toast.error(upErr.message);
      }
      imagePath = path;
    }

    const { data, error } = await supabase
      .from("direct_messages")
      .insert({
        sender_id: me,
        recipient_id: other.id,
        body: body || null,
        image_url: imagePath,
      })
      .select("id, sender_id, recipient_id, body, image_url, created_at, read_at")
      .maybeSingle();
    setSending(false);
    if (error) return toast.error(error.message);
    if (data) setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as Message]));
    setInput("");
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    if (fileRef.current) fileRef.current.value = "";
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-full min-h-[70vh] flex-col">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <img
          src={other.avatar_signed ?? defaultAvatar}
          alt=""
          className="h-10 w-10 rounded-full object-cover"
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{other.username ?? "user"}</div>
          {other.username && (
            <Link
              to="/u/$handle"
              params={{ handle: other.username }}
              className="text-xs text-muted-foreground hover:underline"
            >
              View profile
            </Link>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Say hi 👋
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === me;
            const signed = m.image_url ? imageUrls[m.image_url] : null;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                    mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {m.image_url && (
                    isVideoPath(m.image_url) ? (
                      <div className="mb-1 overflow-hidden rounded-lg">
                        {signed ? (
                          <video
                            src={signed}
                            controls
                            playsInline
                            className="max-h-72 w-auto max-w-full rounded-lg"
                          />
                        ) : (
                          <div className="flex h-40 w-56 items-center justify-center bg-black/10">
                            <Loader2 className="h-5 w-5 animate-spin opacity-70" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <a
                        href={signed ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-1 block overflow-hidden rounded-lg"
                      >
                        {signed ? (
                          <img
                            src={signed}
                            alt="Sent photo"
                            className="max-h-72 w-auto max-w-full rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-40 w-56 items-center justify-center bg-black/10">
                            <Loader2 className="h-5 w-5 animate-spin opacity-70" />
                          </div>
                        )}
                      </a>
                    )
                  )}
                  {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                  <div className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {pendingPreview && (
        <div className="flex items-center gap-3 border-t border-border bg-muted/40 p-3">
          <img src={pendingPreview} alt="Preview" className="h-16 w-16 rounded-lg object-cover" />
          <div className="flex-1 truncate text-xs text-muted-foreground">
            {pendingFile?.name}
          </div>
          <button
            type="button"
            onClick={() => pickFile(null)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background hover:bg-muted"
            aria-label="Remove photo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={sending}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          aria-label="Attach photo"
        >
          <ImagePlus className="h-4 w-4" />
        </button>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={4000}
          placeholder="Type a message…"
          className="h-11 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          disabled={sending || (!input.trim() && !pendingFile)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:brightness-105 disabled:opacity-50"
          aria-label="Send"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}

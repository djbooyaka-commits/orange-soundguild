import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Send, Check, X, MessageCircle, Loader2, ImagePlus, Video, ShieldAlert, Pencil, Trash2 } from "lucide-react";

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!user) {
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

  // Auth is fully resolved and user is guaranteed non-null past this point.
  // Remount the authed subtree on user change so no stale state can leak
  // across sign-in/sign-out transitions.
  return <MessagesAuthed key={user.id} userId={user.id} />;
}

type MessageMeta = {
  lastMessageAt: string | null;
  unreadCount: number;
};

function MessagesAuthed({ userId }: { userId: string }) {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileMini & { avatar_signed: string }>>({});
  const [messageMeta, setMessageMeta] = useState<Record<string, MessageMeta>>({});
  const [activeId, setActiveId] = useState<string | null>(search.with ?? null);

  const loadAll = async () => {
    const { data: fs } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status, created_at")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    const rows = (fs ?? []) as Friendship[];
    setFriendships(rows);
    const otherIds = Array.from(
      new Set(rows.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id))),
    );
    if (otherIds.length > 0) {
      const [{ data: ps }, { data: latest }, { data: unread }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", otherIds),
        supabase
          .from("direct_messages")
          .select("sender_id, recipient_id, created_at")
          .or(
            `and(sender_id.eq.${userId},recipient_id.in.(${otherIds.join(",")})),` +
              `and(recipient_id.eq.${userId},sender_id.in.(${otherIds.join(",")}))`,
          )
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("direct_messages")
          .select("sender_id, recipient_id, read_at")
          .eq("recipient_id", userId)
          .is("read_at", null)
          .limit(1000),
      ]);
      const list = (ps ?? []) as ProfileMini[];
      const next: Record<string, ProfileMini & { avatar_signed: string }> = {};
      await Promise.all(
        list.map(async (p) => {
          next[p.id] = { ...p, avatar_signed: await resolveAvatar(p.avatar_url) };
        }),
      );
      setProfiles(next);

      const meta: Record<string, MessageMeta> = {};
      for (const id of otherIds) {
        meta[id] = { lastMessageAt: null, unreadCount: 0 };
      }
      for (const m of latest ?? []) {
        const other = m.sender_id === userId ? m.recipient_id : m.sender_id;
        if (!meta[other]?.lastMessageAt) {
          meta[other].lastMessageAt = m.created_at;
        }
      }
      for (const m of unread ?? []) {
        if (m.sender_id !== userId) {
          meta[m.sender_id].unreadCount += 1;
        }
      }
      setMessageMeta(meta);
    } else {
      setProfiles({});
      setMessageMeta({});
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    const ch = supabase
      .channel(`friendships:${userId}`)
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
  }, [userId]);

  useEffect(() => {
    const ch = supabase
      .channel(`dm-all:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `sender_id=eq.${userId}` },
        () => void loadAll(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${userId}` },
        () => void loadAll(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${userId}` },
        () => void loadAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const accepted = useMemo(
    () =>
      friendships
        .filter((f) => f.status === "accepted")
        .sort((a, b) => {
          const metaA = messageMeta[otherOf(a, userId)] ?? { lastMessageAt: null, unreadCount: 0 };
          const metaB = messageMeta[otherOf(b, userId)] ?? { lastMessageAt: null, unreadCount: 0 };
          // Unread friends first, then most recent message first.
          if (metaB.unreadCount !== metaA.unreadCount) {
            return metaB.unreadCount - metaA.unreadCount;
          }
          const ta = metaA.lastMessageAt ? new Date(metaA.lastMessageAt).getTime() : 0;
          const tb = metaB.lastMessageAt ? new Date(metaB.lastMessageAt).getTime() : 0;
          return tb - ta;
        }),
    [friendships, messageMeta, userId],
  );
  const incoming = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.addressee_id === userId),
    [friendships, userId],
  );
  const outgoing = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.requester_id === userId),
    [friendships, userId],
  );

  useEffect(() => {
    if (search.with && accepted.some((f) => otherOf(f, userId) === search.with)) {
      setActiveId(search.with);
    } else if (!activeId && accepted.length > 0) {
      setActiveId(otherOf(accepted[0], userId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accepted, search.with, userId]);

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




  return (
    <div className="min-h-screen bg-background pb-40">
      <Navbar />
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-4 sm:px-6 md:h-[calc(100vh-9rem)] md:grid-cols-[320px_1fr] md:py-6">
        {/* Sidebar */}
        <aside className="space-y-6 md:h-full md:overflow-y-auto md:pr-2">
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
                  const otherId = otherOf(f, userId);
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
        <section className="min-h-[70vh] overflow-hidden rounded-2xl border border-border bg-card md:h-full md:min-h-0">
          {activeId ? (
            <ChatPane
              key={activeId}
              me={userId}
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

// Match bare http(s) URLs; trailing punctuation is trimmed before validation.
const URL_RE = /(https?:\/\/[^\s<>"']+)/gi;
const TRAILING_PUNCT_RE = /[)\].,;:!?'"]+$/;

// Domains blocked from being rendered as clickable links in chat.
// Covers known malware/phishing/scam TLDs, adult/hate hubs, and common
// URL shorteners frequently abused to hide the true destination.
const BLOCKED_HOSTS = new Set<string>([
  // Shorteners that hide destinations
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
  "shorturl.at", "cutt.ly", "rebrand.ly", "adf.ly", "bc.vc", "shorte.st",
  "linkvertise.com", "ouo.io", "clk.sh",
  // Known malware/phishing hubs (non-exhaustive; add as needed)
  "grabify.link", "iplogger.org", "iplogger.com", "iplogger.ru", "yip.su",
  "blasze.com", "2no.co",
]);
const BLOCKED_TLDS = new Set<string>([
  "zip", "mov", "xyz", "top", "click", "quest", "cyou", "country", "kim",
  "work", "gq", "ml", "cf", "tk",
]);

type LinkCheckResult =
  | { status: "ok"; url: string }
  | { status: "blocked"; reason: string }
  | { status: "invalid" };

function getBlockReason(host: string): string | null {
  const h = host.toLowerCase();
  if (BLOCKED_HOSTS.has(h)) return "This link was blocked because it leads to a known unsafe domain.";
  for (const b of BLOCKED_HOSTS) {
    if (h.endsWith("." + b)) return "This link was blocked because it leads to a known unsafe domain.";
  }
  const tld = h.split(".").pop() ?? "";
  if (BLOCKED_TLDS.has(tld)) return "This link was blocked because it uses a suspicious domain type.";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return "This link was blocked because IP address links are not allowed.";
  if (h.startsWith("[") && h.endsWith("]")) return "This link was blocked because IP address links are not allowed.";
  if (h.includes("xn--")) return "This link was blocked because it uses suspicious domain encoding.";
  return null;
}

function safeHttpUrl(raw: string): LinkCheckResult {
  let candidate = raw.replace(TRAILING_PUNCT_RE, "");
  while (candidate.endsWith(")") && (candidate.match(/\(/g)?.length ?? 0) < (candidate.match(/\)/g)?.length ?? 0)) {
    candidate = candidate.slice(0, -1);
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return { status: "invalid" };
    if (!u.hostname) return { status: "invalid" };
    if (u.username || u.password) return { status: "invalid" };
    const reason = getBlockReason(u.hostname);
    if (reason) return { status: "blocked", reason };
    return { status: "ok", url: u.toString() };
  } catch {
    return { status: "invalid" };
  }
}

function renderWithLinks(text: string, mine: boolean) {
  const parts = text.split(URL_RE);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const result = safeHttpUrl(part);
      if (result.status === "ok") {
        const trimmed = part.slice(0, result.url.length === part.length ? part.length : part.replace(TRAILING_PUNCT_RE, "").length);
        const tail = part.slice(trimmed.length);
        return (
          <span key={i}>
            <a
              href={result.url}
              target="_blank"
              rel="noreferrer noopener nofollow ugc"
              className={`underline break-all ${mine ? "text-primary-foreground" : "text-primary"}`}
            >
              {trimmed}
            </a>
            {tail}
          </span>
        );
      }
      if (result.status === "blocked") {
        const trimmed = part.replace(TRAILING_PUNCT_RE, "");
        return (
          <span key={i} className="inline-flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
              <ShieldAlert className="h-3 w-3" />
              Link blocked
            </span>
            <span className="text-xs text-muted-foreground" title={result.reason}>
              {trimmed}
            </span>
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

const SPOTIFY_TYPES = new Set(["track", "album", "playlist", "episode", "show", "artist"]);
function spotifyEmbeds(text: string): { key: string; type: string; id: string }[] {
  const found: { key: string; type: string; id: string }[] = [];
  const seen = new Set<string>();
  const matches = text.match(URL_RE) ?? [];
  for (const raw of matches) {
    const result = safeHttpUrl(raw);
    if (result.status !== "ok") continue;
    try {
      const u = new URL(result.url);
      if (u.hostname !== "open.spotify.com" && u.hostname !== "www.open.spotify.com") continue;
      const parts = u.pathname.split("/").filter(Boolean);
      // Support optional locale prefix like /intl-en/track/{id}
      const typeIdx = parts.findIndex((p) => SPOTIFY_TYPES.has(p));
      if (typeIdx === -1 || !parts[typeIdx + 1]) continue;
      const type = parts[typeIdx];
      const id = parts[typeIdx + 1].split("?")[0];
      if (!/^[A-Za-z0-9]{16,32}$/.test(id)) continue;
      const key = `${type}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ key, type, id });
    } catch {
      /* ignore */
    }
  }
  return found;
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
    void (async () => {
      await supabase
        .from("direct_messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unread);
      window.dispatchEvent(new Event("dm-read"));
    })();
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
    <div className="flex h-full min-h-[70vh] flex-col md:min-h-0">
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
                  {m.body && <div className="whitespace-pre-wrap break-words">{renderWithLinks(m.body, mine)}</div>}
                  {m.body && spotifyEmbeds(m.body).map((s) => (
                    <iframe
                      key={s.key}
                      src={`https://open.spotify.com/embed/${s.type}/${s.id}`}
                      title={`Spotify ${s.type}`}
                      loading="lazy"
                      allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
                      referrerPolicy="strict-origin-when-cross-origin"
                      sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
                      className="mt-2 block w-full rounded-xl border-0"
                      style={{ height: s.type === "track" || s.type === "episode" ? 152 : 352 }}
                    />
                  ))}
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
          {pendingFile?.type.startsWith("video/") ? (
            <video src={pendingPreview} className="h-16 w-16 rounded-lg object-cover" muted playsInline />
          ) : (
            <img src={pendingPreview} alt="Preview" className="h-16 w-16 rounded-lg object-cover" />
          )}
          <div className="flex-1 truncate text-xs text-muted-foreground">
            {pendingFile?.name}
          </div>
          <button
            type="button"
            onClick={() => void pickFile(null)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background hover:bg-muted"
            aria-label="Remove attachment"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={sending}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          aria-label="Attach photo or video (max 20s)"
          title="Attach photo or video (max 20s)"
        >
          {pendingFile?.type.startsWith("video/") ? <Video className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
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

import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Trash2, Pencil, MessagesSquare, Loader2, ImagePlus, Video, X, Reply } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signMany } from "@/lib/signMedia";
import defaultAvatar from "@/assets/avatar.jpg";
import {
  listRoomChat,
  postRoomChat,
  editRoomChatMessage,
  deleteRoomChatMessage,
  type ChatScope,
  type RoomChatMessage,
} from "@/lib/api/room-chat.functions";

const VIDEO_EXTS = ["mp4", "webm", "mov", "m4v", "ogg"];
const MAX_VIDEO_SECONDS = 20;
const isVideoUrl = (u: string) => {
  const clean = u.split("?")[0];
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTS.includes(ext);
};

const URL_RE = /((?:https?:\/\/|www\.)[^\s]+)/gi;

function Linkified({ text, mine }: { text: string; mine: boolean }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        URL_RE.lastIndex = 0;
        if (URL_RE.test(part)) {
          URL_RE.lastIndex = 0;
          const href = part.startsWith("http") ? part : `https://${part}`;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={`break-all underline underline-offset-2 ${mine ? "" : "text-primary"}`}
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

type Props = {
  scope: ChatScope;
  roomKey: string;
  title?: string;
};

export function RoomChat({ scope, roomKey, title = "Room chat" }: Props) {
  const listFn = useServerFn(listRoomChat);
  const postFn = useServerFn(postRoomChat);
  const editFn = useServerFn(editRoomChatMessage);
  const deleteFn = useServerFn(deleteRoomChatMessage);

  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [replyTo, setReplyTo] = useState<RoomChatMessage | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const data = (await listFn({ data: { scope, roomKey } })) as RoomChatMessage[];
      const rows = data ?? [];
      // avatar_url is a storage path — sign it so the image actually loads
      const unique = Array.from(
        new Set(rows.map((m) => m.avatar_url).filter((p): p is string => !!p && !p.startsWith("http"))),
      );
      const signed = unique.length
        ? await signMany(unique.map((path) => ({ bucket: "avatars" as const, path })))
        : [];
      const byPath = new Map(unique.map((p, i) => [p, signed[i] ?? null]));
      setMessages(
        rows.map((m) => ({
          ...m,
          avatar_url: m.avatar_url
            ? m.avatar_url.startsWith("http")
              ? m.avatar_url
              : byPath.get(m.avatar_url) ?? null
            : null,
        })),
      );
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load chat");
    } finally {
      setLoading(false);
    }
  }, [listFn, scope, roomKey]);

  useEffect(() => {
    setLoading(true);
    void load();
    // Safety-net refresh in case a realtime event is missed. Realtime already
    // delivers new messages instantly, so this runs rarely and only while the
    // tab is visible.
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void load();
    }, 120000);
    return () => window.clearInterval(id);
  }, [load]);

  // Live updates, same as direct messages
  useEffect(() => {
    const ch = supabase
      .channel(`room-chat:${scope}:${roomKey}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_chat_messages",
          filter: `room_key=eq.${roomKey}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [scope, roomKey, load]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const pickFile = async (f: File | null) => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    if (!f) {
      setPendingFile(null);
      setPendingPreview(null);
      return;
    }
    const isImg = f.type.startsWith("image/");
    const isVid = f.type.startsWith("video/");
    if (!isImg && !isVid) return toast.error("Please pick an image or video file.");
    const maxBytes = isVid ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (f.size > maxBytes) {
      return toast.error(isVid ? "Video is too large (max 50MB)." : "Image is too large (max 10MB).");
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
        return toast.error(`Videos must be ${MAX_VIDEO_SECONDS} seconds or less.`);
      }
      setPendingFile(f);
      setPendingPreview(url);
      return;
    }
    setPendingFile(f);
    setPendingPreview(URL.createObjectURL(f));
  };

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if ((!body && !pendingFile) || sending) return;
    setSending(true);
    try {
      let imageUrl: string | null = null;
      if (pendingFile) {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) throw new Error("Please sign in again.");
        const ext = (pendingFile.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${uid}/${crypto.randomUUID()}.${ext || "jpg"}`;
        const { error: upErr } = await supabase.storage
          .from("chat-images")
          .upload(path, pendingFile, { contentType: pendingFile.type, upsert: false });
        if (upErr) throw new Error(upErr.message);
        imageUrl = path;
      }
      await postFn({ data: { scope, roomKey, body, imageUrl, replyTo: replyTo?.id ?? null } });
      setText("");
      setReplyTo(null);
      await pickFile(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not send message");
    } finally {
      setSending(false);
    }
  };

  const saveEdit = async (m: RoomChatMessage) => {
    const next = editValue.trim();
    if (!next) return toast.error("Message cannot be empty. Delete it instead.");
    if (next === m.body) {
      setEditingId(null);
      return;
    }
    try {
      await editFn({ data: { messageId: m.id, body: next } });
      setMessages((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, body: next, edited_at: new Date().toISOString() } : x)),
      );
      setEditingId(null);
      setEditValue("");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not edit message");
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this message?")) return;
    try {
      await deleteFn({ data: { messageId: id } });
      setMessages((m) => m.filter((x) => x.id !== id));
    } catch (err: any) {
      toast.error(err?.message ?? "Could not delete message");
    }
  };

  return (
    <section className="flex flex-col rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border p-4">
        <MessagesSquare className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground">Members only</span>
      </header>

      {error ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{error}</p>
      ) : (
        <>
          <div ref={scrollRef} className="max-h-[55vh] min-h-[18rem] flex-1 space-y-2 overflow-y-auto p-4">
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
                const mine = m.is_me;
                const isEditing = editingId === m.id;
                return (
                  <div
                    key={m.id}
                    className={`group flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}
                  >
                    {mine && !isEditing && (
                      <div className="flex flex-col gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => setReplyTo(m)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
                          aria-label="Reply to message"
                          title="Reply"
                        >
                          <Reply className="h-3.5 w-3.5" />
                        </button>
                        {!m.image_url && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(m.id);
                            setEditValue(m.body);
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
                          aria-label="Edit message"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void remove(m.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-destructive"
                          aria-label="Delete message"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {!mine && (
                      <img
                        src={m.avatar_url ?? defaultAvatar}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                        loading="lazy"
                      />
                    )}

                    <div className="max-w-[75%]">
                      {!mine && (
                        <p className="mb-0.5 text-xs font-semibold text-muted-foreground">
                          @{m.username ?? m.user_id.slice(0, 8)}
                        </p>
                      )}
                      {isEditing ? (
                        <div className="flex items-end gap-2">
                          <textarea
                            value={editValue}
                            onChange={(ev) => setEditValue(ev.target.value)}
                            rows={2}
                            maxLength={1000}
                            className="w-56 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
                          />
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => void saveEdit(m)}
                              className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded-md border border-border px-2 py-1 text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`rounded-2xl px-3 py-2 text-sm ${
                            mine
                              ? "rounded-br-sm bg-primary text-primary-foreground"
                              : "rounded-bl-sm bg-muted text-foreground"
                          }`}
                        >
                          {m.reply_to && (
                            <div
                              className={`mb-1 rounded-md border-l-2 px-2 py-1 text-xs ${
                                mine
                                  ? "border-primary-foreground/60 bg-primary-foreground/10 text-primary-foreground/80"
                                  : "border-primary bg-background/60 text-muted-foreground"
                              }`}
                            >
                              <span className="font-semibold">@{m.reply_username ?? "member"}</span>
                              <span className="ml-1 line-clamp-2 break-words">{m.reply_body ?? "Message"}</span>
                            </div>
                          )}
                          {m.image_url &&
                            (isVideoUrl(m.image_url) ? (
                              <video
                                src={m.image_url}
                                controls
                                playsInline
                                className="mb-1 max-h-72 w-auto max-w-full rounded-lg"
                              />
                            ) : (
                              <a href={m.image_url} target="_blank" rel="noreferrer" className="mb-1 block">
                                <img
                                  src={m.image_url}
                                  alt="Shared media"
                                  className="max-h-72 w-auto max-w-full rounded-lg object-cover"
                                  loading="lazy"
                                />
                              </a>
                            ))}
                          {m.body && (
                            <p className="whitespace-pre-wrap break-words">
                              <Linkified text={m.body} mine={mine} />
                            </p>
                          )}
                          <p
                            className={`mt-1 text-[10px] ${
                              mine ? "text-primary-foreground/70" : "text-muted-foreground"
                            }`}
                          >
                            {new Date(m.created_at).toLocaleString()}
                            {m.edited_at ? " · edited" : ""}
                          </p>
                        </div>
                      )}
                    </div>

                    {!mine && !isEditing && (
                      <button
                        type="button"
                        onClick={() => setReplyTo(m)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 transition hover:text-foreground focus-within:opacity-100 group-hover:opacity-100"
                        aria-label="Reply to message"
                        title="Reply"
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {replyTo && (
            <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-3 py-2 text-xs">
              <Reply className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold">Replying to @{replyTo.username ?? "member"}</span>
              <span className="flex-1 truncate text-muted-foreground">
                {replyTo.body || (replyTo.image_url ? "Photo" : "")}
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background"
                aria-label="Cancel reply"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {pendingPreview && (
            <div className="flex items-center gap-3 border-t border-border bg-muted/40 p-3">
              {pendingFile?.type.startsWith("video/") ? (
                <video src={pendingPreview} className="h-16 w-16 rounded-lg object-cover" muted playsInline />
              ) : (
                <img src={pendingPreview} alt="Preview" className="h-16 w-16 rounded-lg object-cover" />
              )}
              <div className="flex-1 truncate text-xs text-muted-foreground">{pendingFile?.name}</div>
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

          <form onSubmit={send} className="flex items-end gap-2 border-t border-border p-3">
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
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              aria-label="Attach photo or video (max 20s)"
              title="Attach photo or video (max 20s)"
            >
              {pendingFile?.type.startsWith("video/") ? <Video className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
            </button>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              maxLength={1000}
              placeholder="Write a message…"
              className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={sending || (!text.trim() && !pendingFile)}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Send
            </button>
          </form>
        </>
      )}
    </section>
  );
}

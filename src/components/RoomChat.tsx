import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Trash2, Pencil, MessagesSquare, Loader2 } from "lucide-react";
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
    // Safety-net refresh in case a realtime event is missed.
    const id = window.setInterval(() => void load(), 30000);
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

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await postFn({ data: { scope, roomKey, body } });
      setText("");
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
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
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
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={send} className="flex items-end gap-2 border-t border-border p-3">
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
              disabled={sending || !text.trim()}
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

import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Trash2, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import {
  listRoomChat,
  postRoomChat,
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
  const deleteFn = useServerFn(deleteRoomChatMessage);

  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const data = (await listFn({ data: { scope, roomKey } })) as RoomChatMessage[];
      const rows = data ?? [];
      // avatar_url is a storage path — sign it so the image actually loads
      const unique = Array.from(
        new Set(rows.map((m) => m.avatar_url).filter((p): p is string => !!p)),
      );
      const signed = unique.length
        ? await signMany(unique.map((path) => ({ bucket: "avatars" as const, path })))
        : [];
      const byPath = new Map(unique.map((p, i) => [p, signed[i] ?? null]));
      setMessages(
        rows.map((m) => ({
          ...m,
          avatar_url: m.avatar_url
            ? (m.avatar_url.startsWith("http") ? m.avatar_url : byPath.get(m.avatar_url) ?? null)
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
    const id = window.setInterval(() => void load(), 7000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await postFn({ data: { scope, roomKey, body } });
      setText("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send message");
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteFn({ data: { messageId: id } });
      setMessages((m) => m.filter((x) => x.id !== id));
    } catch (e: any) {
      toast.error(e?.message ?? "Could not delete message");
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-3 flex items-center gap-2">
        <MessagesSquare className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground">Members only</span>
      </header>

      {error ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{error}</p>
      ) : (
        <>
          <div
            ref={scrollRef}
            className="max-h-[50vh] min-h-[12rem] space-y-3 overflow-y-auto rounded-lg bg-muted/30 p-3"
          >
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No messages yet. Say hi to the other streamers.
              </p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="group flex items-start gap-2">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="h-7 w-7 shrink-0 rounded-full bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      <span className={m.is_me ? "font-semibold text-primary" : "font-semibold"}>
                        @{m.username ?? m.user_id.slice(0, 8)}
                      </span>{" "}
                      · {new Date(m.created_at).toLocaleString()}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                  </div>
                  <button
                    onClick={() => remove(m.id)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    title="Delete message"
                    aria-label="Delete message"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 flex items-end gap-2">
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
              onClick={() => void send()}
              disabled={sending || !text.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Send
            </button>
          </div>
        </>
      )}
    </section>
  );
}

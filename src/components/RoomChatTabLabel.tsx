import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ChatScope } from "@/lib/api/room-chat.functions";

type Props = {
  scope: ChatScope;
  roomKey: string;
  active: boolean;
  children: React.ReactNode;
};

export function RoomChatTabLabel({ scope, roomKey, active, children }: Props) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let latestMessageAt = "";
    const storageKey = `osg:room-chat-read:${user.id}:${scope}:${roomKey}`;

    const markRead = (createdAt: string) => {
      latestMessageAt = createdAt;
      try {
        window.localStorage.setItem(storageKey, createdAt);
      } catch {
        /* ignore unavailable storage */
      }
      setUnread(false);
    };

    void supabase
      .from("room_chat_messages")
      .select("created_at,user_id")
      .eq("scope", scope)
      .eq("room_key", roomKey)
      .neq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data?.created_at) return;
        latestMessageAt = data.created_at;
        let lastRead: string | null = null;
        try {
          lastRead = window.localStorage.getItem(storageKey);
        } catch {
          /* ignore unavailable storage */
        }
        if (!lastRead || active) markRead(data.created_at);
        else setUnread(data.created_at > lastRead);
      });

    const channel = supabase
      .channel(`room-chat-alert:${scope}:${roomKey}:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "room_chat_messages", filter: `room_key=eq.${roomKey}` },
        (payload) => {
          const message = payload.new as { scope?: string; user_id?: string; created_at?: string };
          if (message.scope !== scope || message.user_id === user.id) return;
          const createdAt = message.created_at ?? new Date().toISOString();
          latestMessageAt = createdAt;
          if (active) markRead(createdAt);
          else setUnread(true);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [active, roomKey, scope, user]);

  useEffect(() => {
    if (!active || !user) return;
    const storageKey = `osg:room-chat-read:${user.id}:${scope}:${roomKey}`;
    try {
      window.localStorage.setItem(storageKey, new Date().toISOString());
    } catch {
      /* ignore unavailable storage */
    }
    setUnread(false);
  }, [active, roomKey, scope, user]);

  return (
    <span className="relative inline-flex items-center">
      {children}
      {unread && (
        <span
          aria-label="New messages"
          title="New messages"
          className="absolute -right-4 -top-3 text-xl font-black leading-none text-destructive drop-shadow-sm"
        >
          ★
        </span>
      )}
    </span>
  );
}
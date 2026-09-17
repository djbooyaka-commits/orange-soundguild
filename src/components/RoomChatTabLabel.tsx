import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { latestRoomChatAt, type ChatScope } from "@/lib/api/room-chat.functions";

type Props = {
  scope: ChatScope;
  roomKey: string;
  active: boolean;
  children: ReactNode;
};

export function RoomChatTabLabel({ scope, roomKey, active, children }: Props) {
  const { user } = useAuth();
  const latestFn = useServerFn(latestRoomChatAt);
  const [unread, setUnread] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  const storageKey = user ? `osg:room-chat-read:${user.id}:${scope}:${roomKey}` : null;

  const readStamp = useCallback(() => {
    if (!storageKey) return null;
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }, [storageKey]);

  const markRead = useCallback(
    (stamp: string) => {
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, stamp);
        } catch {
          /* ignore unavailable storage */
        }
      }
      setUnread(false);
    },
    [storageKey],
  );

  const check = useCallback(async () => {
    if (!user) return;
    try {
      const res = (await latestFn({ data: { scope, roomKey } })) as { created_at: string | null };
      const latest = res?.created_at;
      if (!latest) return;
      if (activeRef.current) {
        markRead(latest);
        return;
      }
      const last = readStamp();
      setUnread(!last || latest > last);
    } catch {
      /* ignore */
    }
  }, [latestFn, markRead, readStamp, roomKey, scope, user]);

  // Realtime is the primary signal; this slow poll is only a safety net, and it
  // pauses while the tab is hidden to keep background usage low.
  useEffect(() => {
    if (!user) return;
    void check();
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void check();
    }, 120000);
    return () => window.clearInterval(id);
  }, [check, user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`room-chat-alert:${scope}:${roomKey}:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "room_chat_messages", filter: `room_key=eq.${roomKey}` },
        () => void check(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [check, roomKey, scope, user]);

  // Opening the tab clears the marker.
  useEffect(() => {
    if (!active || !user) return;
    markRead(new Date().toISOString());
  }, [active, markRead, user]);

  return (
    <span className="relative inline-flex items-center pr-4">
      {children}
      {unread && (
        <span
          aria-label="New messages"
          title="New messages"
          className="absolute -right-2 -top-2 inline-flex h-4 w-4 animate-pulse items-center justify-center rounded-full bg-destructive text-[10px] font-black text-destructive-foreground shadow ring-2 ring-background"
        >
          ★
        </span>
      )}
    </span>
  );
}

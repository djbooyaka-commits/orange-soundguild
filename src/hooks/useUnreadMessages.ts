import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useUnreadMessages() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    const me = user.id;
    let cancelled = false;

    const load = async () => {
      const { count: c } = await supabase
        .from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", me)
        .is("read_at", null);
      if (!cancelled) setCount(c ?? 0);
    };
    void load();

    const ch = supabase
      .channel(`dm-unread:${me}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${me}` },
        () => {
          void load();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${me}` },
        () => {
          void load();
        },
      )
      .subscribe();

    // Refresh when tab regains focus (covers marking-read from another tab)
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      window.removeEventListener("focus", onFocus);
    };
  }, [user]);

  return count;
}

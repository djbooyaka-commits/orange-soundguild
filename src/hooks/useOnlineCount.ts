import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks how many visitors are currently on the site via Supabase Realtime presence.
 */
export function useOnlineCount() {
  const [count, setCount] = useState<number>(1);

  useEffect(() => {
    const key = crypto.randomUUID();
    const channel = supabase.channel("online-users", {
      config: { presence: { key } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return count;
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useHasBetaRooms() {
  const { user } = useAuth();
  const [hasBetaRooms, setHasBetaRooms] = useState(false);

  useEffect(() => {
    if (!user) {
      setHasBetaRooms(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("beta_room_members")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);
      if (!cancelled) setHasBetaRooms((data ?? []).length > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return hasBetaRooms;
}

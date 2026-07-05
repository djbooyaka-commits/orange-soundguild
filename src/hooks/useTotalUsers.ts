import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Total registered users on the site. */
export function useTotalUsers() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_total_users" as never);
      if (!cancelled) setCount(Number(data ?? 0));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}

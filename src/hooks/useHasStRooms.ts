import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listCuratorInvitesForMe } from "@/lib/api/curator-invites.functions";
import { useAuth } from "./useAuth";

export function useHasStRooms() {
  const { user } = useAuth();
  const listFn = useServerFn(listCuratorInvitesForMe);
  const [hasRooms, setHasRooms] = useState(false);

  useEffect(() => {
    if (!user) {
      setHasRooms(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = (await listFn()) as Array<{ status: string }>;
        if (!cancelled) {
          setHasRooms((data ?? []).some((i) => i.status === "accepted"));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, listFn]);

  return hasRooms;
}

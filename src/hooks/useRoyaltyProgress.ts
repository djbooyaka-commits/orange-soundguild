import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RoyaltyProgress = {
  followers: number;
  artistReferrals: number;
  superfanReferrals: number;
  eligible: boolean;
};

export const ROYALTY_THRESHOLDS = {
  followers: 500,
  artistReferrals: 20,
  superfanReferrals: 40,
};

export function useRoyaltyProgress(userId: string | null | undefined) {
  const [data, setData] = useState<RoyaltyProgress | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setData(null);
      return;
    }
    setLoading(true);
    supabase
      .rpc("get_royalty_progress", { _user_id: userId })
      .then(({ data: rows }) => {
        if (cancelled) return;
        const row = Array.isArray(rows) ? rows[0] : null;
        setData(
          row
            ? {
                followers: Number(row.followers ?? 0),
                artistReferrals: Number(row.artist_referrals ?? 0),
                superfanReferrals: Number(row.superfan_referrals ?? 0),
                eligible: !!row.eligible,
              }
            : { followers: 0, artistReferrals: 0, superfanReferrals: 0, eligible: false },
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { data, loading };
}

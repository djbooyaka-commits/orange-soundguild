import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AccountType = "fan" | "artist" | "superfan" | "pioneer";

export function useAccountType() {
  const { user } = useAuth();
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setAccountType(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("profiles")
      .select("account_type")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setAccountType((data?.account_type as AccountType) ?? "fan");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const upgradeToArtist = useCallback(async () => {
    if (!user) throw new Error("Not signed in");
    const { error } = await supabase
      .from("profiles")
      .update({ account_type: "artist" })
      .eq("id", user.id);
    if (error) throw error;
    setAccountType("artist");
  }, [user]);

  return { accountType, isArtist: accountType === "artist", isFan: accountType === "fan", isPioneer: accountType === "pioneer", loading, upgradeToArtist };
}

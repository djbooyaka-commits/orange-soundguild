import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useIsAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setIsAdmin(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!cancelled) setIsAdmin(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return isAdmin;
}

export async function adminDeleteTrack(id: string) {
  const { data: row } = await supabase
    .from("tracks")
    .select("audio_url, cover_art_url")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("tracks").delete().eq("id", id);
  if (error) throw error;
  if (row?.audio_url && !row.audio_url.startsWith("http")) {
    await supabase.storage.from("audio").remove([row.audio_url]);
  }
  if (row?.cover_art_url && !row.cover_art_url.startsWith("http")) {
    await supabase.storage.from("covers").remove([row.cover_art_url]);
  }
}

export async function setUserBanned(userId: string, banned: boolean) {
  const { error } = await supabase.rpc("admin_set_banned", {
    _user_id: userId,
    _banned: banned,
  });
  if (error) throw error;
}

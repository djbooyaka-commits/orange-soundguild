import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useFollow(targetUserId: string | null) {
  const { user } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!targetUserId) return;
    const [{ count: fCount }, { count: gCount }] = await Promise.all([
      supabase
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("following_id", targetUserId),
      supabase
        .from("follows")
        .select("following_id", { count: "exact", head: true })
        .eq("follower_id", targetUserId),
    ]);
    setFollowers(fCount ?? 0);
    setFollowing(gCount ?? 0);
    if (user && user.id !== targetUserId) {
      const { data } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", user.id)
        .eq("following_id", targetUserId)
        .maybeSingle();
      setIsFollowing(!!data);
    } else {
      setIsFollowing(false);
    }
  }, [targetUserId, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = useCallback(async () => {
    if (!user) throw new Error("Sign in to follow artists.");
    if (!targetUserId || targetUserId === user.id) return;
    setLoading(true);
    try {
      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", targetUserId);
        if (error) throw error;
        setIsFollowing(false);
        setFollowers((n) => Math.max(0, n - 1));
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({ follower_id: user.id, following_id: targetUserId });
        if (error) throw error;
        setIsFollowing(true);
        setFollowers((n) => n + 1);
      }
    } finally {
      setLoading(false);
    }
  }, [user, targetUserId, isFollowing]);

  return { isFollowing, followers, following, toggle, loading, canFollow: !!user && !!targetUserId && user.id !== targetUserId };
}

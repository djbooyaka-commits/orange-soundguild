import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function FriendRequestsBell() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    let cancelled = false;

    const load = async () => {
      const { count: c } = await supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("addressee_id", user.id)
        .eq("status", "pending");
      if (!cancelled) setCount(c ?? 0);
    };
    load();

    const channel = supabase
      .channel(`friend-requests-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
          filter: `addressee_id=eq.${user.id}`,
        },
        async (payload) => {
          if (payload.eventType === "INSERT" && (payload.new as { status?: string })?.status === "pending") {
            const requesterId = (payload.new as { requester_id?: string })?.requester_id;
            let name = "Someone";
            if (requesterId) {
              const { data } = await supabase
                .from("profiles")
                .select("username")
                .eq("id", requesterId)
                .maybeSingle();
              if (data?.username) name = data.username;
            }
            toast(`${name} sent you a friend request`, {
              action: { label: "View", onClick: () => (window.location.href = "/messages") },
            });
          }
          load();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (!user) return null;

  return (
    <Link
      to="/messages"
      aria-label={count > 0 ? `${count} friend requests` : "Notifications"}
      className="relative hidden h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground sm:flex"
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

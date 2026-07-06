import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { UserPlus, Clock, Check, X, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Row = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined";
};

export function FriendButton({ targetUserId }: { targetUserId: string | null }) {
  const { user } = useAuth();
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user || !targetUserId || user.id === targetUserId) {
      setRow(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status")
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${targetUserId}),` +
          `and(requester_id.eq.${targetUserId},addressee_id.eq.${user.id})`,
      )
      .maybeSingle();
    setRow((data as Row | null) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, targetUserId]);

  if (!user || !targetUserId || user.id === targetUserId) return null;
  if (loading) return null;

  const base =
    "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-sm transition disabled:opacity-60";

  const send = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from("friendships")
      .insert({ requester_id: user.id, addressee_id: targetUserId, status: "pending" })
      .select("id, requester_id, addressee_id, status")
      .maybeSingle();
    setBusy(false);
    if (error) return toast.error(error.message);
    setRow(data as Row);
    toast.success("Friend request sent");
  };

  const accept = async () => {
    if (!row) return;
    setBusy(true);
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", row.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setRow({ ...row, status: "accepted" });
    toast.success("You're now friends");
  };

  const remove = async () => {
    if (!row) return;
    setBusy(true);
    const { error } = await supabase.from("friendships").delete().eq("id", row.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setRow(null);
  };

  if (!row) {
    return (
      <button onClick={send} disabled={busy} className={`${base} bg-primary text-primary-foreground hover:brightness-105`}>
        <UserPlus className="h-4 w-4" /> Add friend
      </button>
    );
  }

  if (row.status === "accepted") {
    return (
      <Link to="/messages" search={{ with: targetUserId }} className={`${base} bg-primary text-primary-foreground hover:brightness-105`}>
        <MessageCircle className="h-4 w-4" /> Message
      </Link>
    );
  }

  if (row.status === "pending" && row.addressee_id === user.id) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={accept} disabled={busy} className={`${base} bg-emerald-600 text-white hover:brightness-105`}>
          <Check className="h-4 w-4" /> Accept
        </button>
        <button onClick={remove} disabled={busy} className={`${base} border border-border bg-background text-foreground hover:bg-muted`}>
          <X className="h-4 w-4" /> Decline
        </button>
      </div>
    );
  }

  return (
    <button onClick={remove} disabled={busy} className={`${base} border border-border bg-background text-foreground hover:bg-muted`}>
      <Clock className="h-4 w-4" /> Request sent
    </button>
  );
}

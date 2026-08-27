import { publicOrigin } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Copy, Check } from "lucide-react";
import { getBetaRoomInvite } from "@/lib/api/beta-curator.functions";

export function BetaRoomInvite({ roomId }: { roomId: string }) {
  const inviteFn = useServerFn(getBetaRoomInvite);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    inviteFn({ data: { roomId } })
      .then((r: any) => {
        if (!cancelled) setCode(r?.code ?? null);
      })
      .catch(() => {
        if (!cancelled) setCode(null);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteFn, roomId]);

  const inviteUrl = code ? `${publicOrigin()}/beta-rooms?invite=${code}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Link2 className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold">Your invite link</h2>
          <p className="text-sm text-muted-foreground">
            This room is invite-only. Anyone who opens this link while signed in joins the room and
            starts earning points from their Last.fm scrobbles.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={inviteUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={copy}
          disabled={!inviteUrl}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

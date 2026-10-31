import { useEffect, useState } from "react";
import { Loader2, Send, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useAccountType } from "@/hooks/useAccountType";

const MIN_CENTS = 2500;

type Method = "paypal" | "phantom";

export function CashoutDialog({
  children,
  balanceCents,
  onSubmitted,
}: {
  children: React.ReactNode;
  balanceCents: number;
  onSubmitted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method>("paypal");
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDestination("");
    setAmount(((Math.max(balanceCents, MIN_CENTS)) / 100).toFixed(2));
    setMethod("paypal");
  }, [open, balanceCents]);

  const amountCents = Math.round(Number(amount || 0) * 100);
  const canSubmit =
    !busy &&
    destination.trim().length > 0 &&
    amountCents >= MIN_CENTS &&
    amountCents <= balanceCents;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    const { error } = await supabase.rpc("request_payout", {
      _method: method,
      _destination: destination.trim(),
      _amount_cents: amountCents,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message || "Cashout failed");
      return;
    }
    toast.success("Cashout request submitted");
    setOpen(false);
    onSubmitted();
  }

  const insufficient = balanceCents < MIN_CENTS;
  const { isArtist, loading: acctLoading } = useAccountType();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" /> Cash out
          </DialogTitle>
          <DialogDescription>
            Minimum $25.00. Available balance: ${(balanceCents / 100).toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        {!acctLoading && !isArtist ? (
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            A paid Artist account is required to cash out. Your balance stays saved until you upgrade.
            <Link
              to="/upgrade"
              className="mt-3 flex h-9 w-fit items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground"
            >
              Upgrade to Artist to cash out
            </Link>
          </div>
        ) : insufficient ? (
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            You need at least $25.00 to request a cashout. Keep earning and check back.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Payout method
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["paypal", "phantom"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      method === m
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground hover:bg-muted"
                    }`}
                  >
                    {m === "paypal" ? "PayPal" : "Phantom (SOL)"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="dest" className="text-xs font-semibold uppercase text-muted-foreground">
                {method === "paypal" ? "PayPal email" : "Phantom wallet address"}
              </label>
              <input
                id="dest"
                type={method === "paypal" ? "email" : "text"}
                required
                autoComplete="off"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder={
                  method === "paypal" ? "you@example.com" : "Solana wallet address"
                }
                className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="amount" className="text-xs font-semibold uppercase text-muted-foreground">
                Amount (USD)
              </label>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <input
                  id="amount"
                  type="number"
                  min="25"
                  step="0.01"
                  max={(balanceCents / 100).toFixed(2)}
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setAmount((balanceCents / 100).toFixed(2))}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Max
                </button>
              </div>
              {amountCents > 0 && amountCents < MIN_CENTS && (
                <p className="mt-1 text-xs text-destructive">Minimum is $25.00</p>
              )}
              {amountCents > balanceCents && (
                <p className="mt-1 text-xs text-destructive">Exceeds your balance</p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Requests are reviewed and paid out manually within a few business days. Your
              balance is deducted immediately; rejected requests are refunded.
            </p>

            <button
              type="submit"
              disabled={!canSubmit}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" /> Request cashout
                </>
              )}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

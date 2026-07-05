import { Buffer } from "buffer";
if (typeof window !== "undefined" && !(window as unknown as { Buffer?: unknown }).Buffer) {
  (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "@tanstack/react-router";
import { verifyArtistPayment } from "@/lib/api/artist-payment.functions";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey: PublicKey | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>;
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
};

function getPhantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { solana?: PhantomProvider; phantom?: { solana?: PhantomProvider } };
  const p = w.phantom?.solana ?? w.solana;
  return p?.isPhantom ? p : null;
}

type Props = {
  token: "USDC" | "SOL";
  receiver: string;
  usdcMint: string;
  usdcDecimals: number;
  priceUsd: number;
  solUsd: number | null;
  rpcUrl: string;
};

export function PhantomBrowserPay({
  token,
  receiver,
  usdcMint,
  usdcDecimals,
  priceUsd,
  solUsd,
  rpcUrl,
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const verify = useServerFn(verifyArtistPayment);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");

  const pay = async () => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    const provider = getPhantom();
    if (!provider) {
      toast.error("Phantom not detected. Install the Phantom browser extension.");
      window.open("https://phantom.app/download", "_blank");
      return;
    }
    if (token === "SOL" && !solUsd) {
      toast.error("SOL price unavailable, try USDC.");
      return;
    }

    setBusy(true);
    try {
      setStatus("Connecting to Phantom…");
      const { publicKey } = await provider.connect();
      const payer = publicKey;
      const receiverPk = new PublicKey(receiver);
      const connection = new Connection(rpcUrl, "confirmed");

      const tx = new Transaction();

      if (token === "SOL") {
        const lamports = Math.ceil((priceUsd / (solUsd as number)) * LAMPORTS_PER_SOL);
        tx.add(
          SystemProgram.transfer({
            fromPubkey: payer,
            toPubkey: receiverPk,
            lamports,
          }),
        );
      } else {
        const mint = new PublicKey(usdcMint);
        const fromAta = await getAssociatedTokenAddress(mint, payer);
        const toAta = await getAssociatedTokenAddress(mint, receiverPk);

        // Ensure receiver ATA exists; create if missing (payer funds rent)
        try {
          await getAccount(connection, toAta);
        } catch {
          tx.add(
            createAssociatedTokenAccountInstruction(payer, toAta, receiverPk, mint),
          );
        }

        const amount = BigInt(Math.round(priceUsd * 10 ** usdcDecimals));
        tx.add(createTransferInstruction(fromAta, toAta, payer, amount));
      }

      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = payer;

      setStatus("Approve the transaction in Phantom…");
      const { signature } = await provider.signAndSendTransaction(tx);

      setStatus("Confirming on Solana…");
      await connection.confirmTransaction(signature, "confirmed");

      setStatus("Activating your artist access…");
      const res = await verify({ data: { signature, token } });
      toast.success(
        `You're an artist! Active until ${new Date(res.expiresAt).toLocaleDateString()}.`,
      );
      navigate({ to: "/" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      toast.error(msg);
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={pay}
        disabled={busy}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 text-sm font-semibold text-background shadow-sm transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        {busy ? status || "Working…" : `Pay with Phantom extension`}
      </button>
      <p className="text-center text-[11px] text-muted-foreground">
        Uses your Phantom browser extension — no signature copy-paste needed.
      </p>
    </div>
  );
}

export default PhantomBrowserPay;

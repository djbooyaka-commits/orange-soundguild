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
import bs58 from "bs58";

const RECEIVER = "GeiXPwBprWDwSzYq7qiqsV6eRRqTuLf1PaowHZjcdQZr";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;
const PRICE_USD = 10;
const RPC_URL = "https://api.mainnet-beta.solana.com";

async function fetchSolUsd(): Promise<number> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
  );
  if (!res.ok) throw new Error("Could not fetch SOL price");
  const j = (await res.json()) as { solana?: { usd?: number } };
  const p = j?.solana?.usd;
  if (!p || p <= 0) throw new Error("Invalid SOL price");
  return p;
}

export async function buildPhantomTx(payerStr: string, token: "SOL" | "USDC") {
  const payer = new PublicKey(payerStr);
  const receiver = new PublicKey(RECEIVER);
  const connection = new Connection(RPC_URL, "confirmed");

  const tx = new Transaction();

  if (token === "SOL") {
    const solUsd = await fetchSolUsd();
    const lamports = Math.ceil((PRICE_USD / solUsd) * LAMPORTS_PER_SOL);
    tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: receiver, lamports }));
  } else {
    const mint = new PublicKey(USDC_MINT);
    const fromAta = await getAssociatedTokenAddress(mint, payer);
    const toAta = await getAssociatedTokenAddress(mint, receiver);
    try {
      await getAccount(connection, toAta);
    } catch {
      tx.add(createAssociatedTokenAccountInstruction(payer, toAta, receiver, mint));
    }
    const amount = BigInt(Math.round(PRICE_USD * 10 ** USDC_DECIMALS));
    tx.add(createTransferInstruction(fromAta, toAta, payer, amount));
  }

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;

  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return { transactionBase58: bs58.encode(serialized) };
}

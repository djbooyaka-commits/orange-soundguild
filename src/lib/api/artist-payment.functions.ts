import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const buildArtistPaymentTx = createServerFn({ method: "POST" })
  .inputValidator((data: { token: "SOL" | "USDC"; from: string }) => {
    if (data.token !== "SOL" && data.token !== "USDC") throw new Error("Bad token");
    if (!data.from || typeof data.from !== "string") throw new Error("Missing wallet");
    return data;
  })
  .handler(async ({ data }) => {
    const { buildTxOnChain, NETWORK, RECEIVER } = await import(
      "./artist-payment.server"
    );
    const built = await buildTxOnChain(data.token, data.from);
    return {
      token: data.token,
      amount: built.amount,
      solUsdPrice: built.solUsdPrice,
      network: NETWORK,
      receiver: RECEIVER,
      messageBase58: built.messageBase58,
    };
  });

export const verifyArtistPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { signature: string; token: "SOL" | "USDC" }) => {
    if (!data?.signature || typeof data.signature !== "string" || data.signature.length < 20)
      throw new Error("Invalid signature");
    if (data.token !== "SOL" && data.token !== "USDC") throw new Error("Bad token");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("artist_subscriptions")
      .select("id")
      .eq("tx_signature", data.signature)
      .maybeSingle();
    if (existing) throw new Error("This transaction has already been used.");

    const { verifyTxOnChain, SUB_DAYS, NETWORK } = await import(
      "./artist-payment.server"
    );
    const { feePayer, verifiedAmount } = await verifyTxOnChain(data.signature, data.token);
    const expiresAt = new Date(Date.now() + SUB_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { error: insErr } = await supabase.from("artist_subscriptions").insert({
      user_id: userId,
      tx_signature: data.signature,
      token: data.token,
      amount: verifiedAmount,
      from_wallet: feePayer,
      network: NETWORK,
      expires_at: expiresAt,
    });
    if (insErr) throw new Error(insErr.message);

    const { error: upErr } = await supabase
      .from("profiles")
      .update({ account_type: "artist" })
      .eq("id", userId);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, expiresAt, amount: verifiedAmount, token: data.token };
  });

import { createServerFn } from "@tanstack/react-start";

export const buildPhantomTransaction = createServerFn({ method: "POST" })
  .inputValidator((data: { payer: string; token: "SOL" | "USDC" }) => {
    if (!data?.payer || data.payer.length < 32) throw new Error("Invalid payer");
    if (data.token !== "SOL" && data.token !== "USDC") throw new Error("Bad token");
    return data;
  })
  .handler(async ({ data }) => {
    const { buildPhantomTx } = await import("./phantom-tx.server");
    return buildPhantomTx(data.payer, data.token);
  });

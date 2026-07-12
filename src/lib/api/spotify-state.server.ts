import { createHmac, timingSafeEqual } from "node:crypto";

export function signState(userId: string, expMs: number): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback";
  const payload = `${userId}.${expMs}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyState(state: string): string | null {
  try {
    const raw = Buffer.from(state, "base64url").toString();
    const parts = raw.split(".");
    if (parts.length !== 3) return null;
    const [userId, expStr, sig] = parts;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback";
    const expected = createHmac("sha256", secret).update(`${userId}.${expStr}`).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Date.now() > parseInt(expStr, 10)) return null;
    return userId;
  } catch {
    return null;
  }
}

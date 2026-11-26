import { createHmac, timingSafeEqual } from "node:crypto";

// Signed keys for the OSG Spotify Helper desktop app. The key names the curator and
// an expiry, so the app can read and update that curator's queue without a site login.
const KEY_DAYS = 90;
const secret = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Desktop keys are unavailable");
  return key;
};
const sign = (payload: string) => createHmac("sha256", secret()).update(`desktop.${payload}`).digest("hex");

export function signDesktopKey(userId: string, nowMs = Date.now()): { key: string; expiresAt: string } {
  const exp = nowMs + KEY_DAYS * 86_400_000;
  const payload = `${userId}.${exp}`;
  return { key: Buffer.from(`${payload}.${sign(payload)}`).toString("base64url"), expiresAt: new Date(exp).toISOString() };
}

/** Returns the curator id if the key is genuine and not expired. */
export function verifyDesktopKey(key: string, nowMs = Date.now()): string | null {
  try {
    const parts = Buffer.from(key, "base64url").toString().split(".");
    if (parts.length !== 3) return null;
    const [u, expStr, sig] = parts as [string, string, string];
    if (!/^[0-9a-f-]{36}$/i.test(u)) return null;
    const a = Buffer.from(sig);
    const b = Buffer.from(sign(`${u}.${expStr}`));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const exp = Number(expStr);
    return Number.isFinite(exp) && exp > nowMs ? u : null;
  } catch {
    return null;
  }
}

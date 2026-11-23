import { createHmac, timingSafeEqual } from "node:crypto";

// Signed "this song started playing at T" tickets for OSG room points. The
// server issues one when playback starts and only credits a point once real
// time has passed, so a member can't award themselves points without playing.
const secret = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Play tickets are unavailable");
  return key;
};

export function signOsgPlayTicket(userId: string, trackId: string, startedMs: number): string {
  const payload = `${userId}.${trackId}.${startedMs}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

/** Returns the start time if the ticket was issued to this user for this track. */
export function verifyOsgPlayTicket(ticket: string, userId: string, trackId: string): number | null {
  try {
    const parts = Buffer.from(ticket, "base64url").toString().split(".");
    if (parts.length !== 4) return null;
    const [u, t, startedStr, sig] = parts as [string, string, string, string];
    if (u !== userId || t !== trackId) return null;
    const expected = createHmac("sha256", secret()).update(`${u}.${t}.${startedStr}`).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const started = Number(startedStr);
    return Number.isFinite(started) ? started : null;
  } catch {
    return null;
  }
}

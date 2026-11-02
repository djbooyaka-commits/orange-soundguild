export const SUBSCRIPTION_DAYS = 30;
const DAY_MS = 86_400_000;

export function subscriptionDaysRemaining(expiresAt: string | null, now = Date.now()) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / DAY_MS)) || 0;
}

export function renewalExpiration(expiresAt: string | null, now = Date.now()) {
  const existing = expiresAt ? Date.parse(expiresAt) : now;
  return new Date(Math.max(now, Number.isFinite(existing) ? existing : now) + SUBSCRIPTION_DAYS * DAY_MS).toISOString();
}
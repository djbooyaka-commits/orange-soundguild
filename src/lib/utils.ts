import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Canonical public origin for shareable links (referrals, profile, track
 * shares, invites). Preview/editor hosts (lovableproject.com, lovable.app,
 * localhost) require workspace access, so links must point at the live
 * custom domain to work for the public.
 */
export function publicOrigin(): string {
  if (typeof window === "undefined") return "https://orangesoundguild.com";
  const host = window.location.hostname;
  const isPublicProd =
    host === "orangesoundguild.com" ||
    host === "www.orangesoundguild.com" ||
    host === "orange-soundguild.lovable.app";
  return isPublicProd ? window.location.origin : "https://orangesoundguild.com";
}

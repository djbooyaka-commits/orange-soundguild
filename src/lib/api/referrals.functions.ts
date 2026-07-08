import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Attach a referral code to the current user, but only if they don't
 * already have a referrer and were created recently. Used to credit
 * Google-OAuth signups that came through a track share link (?ref=CODE),
 * since OAuth signup cannot pass ref_code through raw_user_meta_data.
 */
export const claimReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => {
    const clean = String(input?.code ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 32);
    return { code: clean };
  })
  .handler(async ({ data, context }) => {
    if (!data.code) return { claimed: false as const };
    const { data: ok, error } = await context.supabase.rpc("claim_referral", {
      _code: data.code,
    });
    if (error) throw new Error(error.message);
    return { claimed: Boolean(ok) };
  });

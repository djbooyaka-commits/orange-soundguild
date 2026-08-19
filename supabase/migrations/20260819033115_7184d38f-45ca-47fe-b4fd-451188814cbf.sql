-- Ensure sensitive profile columns are not readable by anon/authenticated.
REVOKE SELECT (credit_balance_cents, referral_code, referred_by, is_banned, royalty_test_override, tos_accepted, tos_accepted_at, osg_weekly_min) ON public.profiles FROM anon, authenticated;
REVOKE UPDATE (osg_weekly_min) ON public.profiles FROM anon, authenticated;

-- Rename SELECT policies to reflect that column privileges limit exposure to public columns only.
ALTER POLICY "Public profile columns readable by anon" ON public.profiles RENAME TO "Profiles readable by anon (public columns only via column grants)";
ALTER POLICY "Public profile columns readable by authenticated" ON public.profiles RENAME TO "Profiles readable by authenticated (public columns only via column grants)";

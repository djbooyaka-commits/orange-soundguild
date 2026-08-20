-- Re-assert least-privilege column grants on public.profiles (defense in depth)
REVOKE SELECT ON TABLE public.profiles FROM anon, authenticated;

REVOKE SELECT (
  credit_balance_cents,
  referral_code,
  referred_by,
  is_banned,
  royalty_test_override,
  tos_accepted,
  tos_accepted_at,
  osg_weekly_min
) ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id,
  username,
  avatar_url,
  bio,
  account_type,
  website_url,
  twitter_url,
  instagram_url,
  tiktok_url,
  youtube_url,
  spotify_url,
  facebook_url,
  created_at,
  updated_at
) ON public.profiles TO anon, authenticated;

GRANT ALL ON public.profiles TO service_role;

COMMENT ON COLUMN public.profiles.credit_balance_cents IS 'SENSITIVE: owner/admin only. Never GRANT SELECT to anon/authenticated.';
COMMENT ON COLUMN public.profiles.referral_code IS 'SENSITIVE: owner/admin only. Never GRANT SELECT to anon/authenticated.';
COMMENT ON COLUMN public.profiles.referred_by IS 'SENSITIVE: owner/admin only. Never GRANT SELECT to anon/authenticated.';
COMMENT ON COLUMN public.profiles.is_banned IS 'SENSITIVE: owner/admin only. Never GRANT SELECT to anon/authenticated.';
COMMENT ON COLUMN public.profiles.royalty_test_override IS 'SENSITIVE: owner/admin only. Never GRANT SELECT to anon/authenticated.';
COMMENT ON COLUMN public.profiles.tos_accepted IS 'SENSITIVE: owner/admin only. Never GRANT SELECT to anon/authenticated.';
COMMENT ON COLUMN public.profiles.tos_accepted_at IS 'SENSITIVE: owner/admin only. Never GRANT SELECT to anon/authenticated.';
COMMENT ON COLUMN public.profiles.osg_weekly_min IS 'SENSITIVE: owner/admin only. Never GRANT SELECT to anon/authenticated.';
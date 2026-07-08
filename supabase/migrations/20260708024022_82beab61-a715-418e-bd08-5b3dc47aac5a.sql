
-- 1. Helper so the share-link flow can look up an artist's referral code
--    without exposing the whole referral_code column publicly.
CREATE OR REPLACE FUNCTION public.get_track_share_ref(_track_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.referral_code
  FROM public.tracks t
  JOIN public.profiles p ON p.id = t.user_id
  WHERE t.id = _track_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_track_share_ref(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_track_share_ref(uuid) TO anon, authenticated;

-- 2. Lock down sensitive columns on public.profiles via column-level privileges.
--    RLS still gates rows; column grants gate which columns those roles can read.
--    Owners/admins keep access via existing SECURITY DEFINER RPCs
--    (get_my_referral_info, is_banned, get_royalty_progress) and service_role.

REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;

-- Public / safe columns readable by anyone
GRANT SELECT (
  id, username, avatar_url, bio, account_type,
  created_at, updated_at,
  website_url, twitter_url, instagram_url,
  tiktok_url, youtube_url, spotify_url, facebook_url
) ON public.profiles TO anon, authenticated;

-- Sensitive columns (credit_balance_cents, is_banned, referral_code,
-- referred_by, royalty_test_override, tos_accepted, tos_accepted_at)
-- are intentionally NOT granted to anon or authenticated. service_role
-- keeps full access via the pre-existing table-level GRANT ALL.

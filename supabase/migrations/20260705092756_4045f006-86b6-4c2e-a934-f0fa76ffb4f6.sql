
CREATE OR REPLACE FUNCTION public.get_royalty_progress(_user_id uuid)
RETURNS TABLE(
  followers bigint,
  artist_referrals bigint,
  superfan_referrals bigint,
  eligible boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH f AS (
    SELECT count(*)::bigint AS n FROM public.follows WHERE following_id = _user_id
  ),
  ar AS (
    SELECT count(*)::bigint AS n
    FROM public.profiles p
    WHERE p.referred_by = _user_id AND p.account_type = 'artist'
  ),
  sr AS (
    SELECT count(*)::bigint AS n
    FROM public.profiles p
    WHERE p.referred_by = _user_id AND p.account_type = 'superfan'
  )
  SELECT
    f.n,
    ar.n,
    sr.n,
    (f.n >= 500 OR ar.n >= 20 OR sr.n >= 40) AS eligible
  FROM f, ar, sr;
$$;

CREATE OR REPLACE FUNCTION public.is_royalty_eligible(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT eligible FROM public.get_royalty_progress(_user_id)), false);
$$;

GRANT EXECUTE ON FUNCTION public.get_royalty_progress(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_royalty_eligible(uuid) TO anon, authenticated;

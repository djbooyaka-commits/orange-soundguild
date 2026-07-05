
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS royalty_test_override boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_royalty_progress(_user_id uuid)
 RETURNS TABLE(followers bigint, artist_referrals bigint, superfan_referrals bigint, eligible boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ),
  o AS (
    SELECT COALESCE(royalty_test_override, false) AS ov FROM public.profiles WHERE id = _user_id
  )
  SELECT
    f.n,
    ar.n,
    sr.n,
    (f.n >= 500 OR ar.n >= 20 OR sr.n >= 40 OR COALESCE(o.ov, false)) AS eligible
  FROM f, ar, sr, o;
$function$;

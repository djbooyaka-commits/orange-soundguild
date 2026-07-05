CREATE OR REPLACE FUNCTION public.get_monthly_listeners(_artist_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT tp.user_id)::bigint
  FROM public.track_plays tp
  JOIN public.tracks t ON t.id = tp.track_id
  WHERE t.user_id = _artist_id
    AND tp.user_id IS NOT NULL
    AND tp.created_at >= (now() - interval '30 days');
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_listeners(uuid) TO anon, authenticated;
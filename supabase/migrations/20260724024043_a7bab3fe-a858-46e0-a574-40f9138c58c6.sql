CREATE OR REPLACE FUNCTION public.list_my_osg_rosters()
RETURNS TABLE(
  curator_id uuid,
  curator_username text,
  curator_avatar_url text,
  artist_id uuid,
  username text,
  avatar_url text,
  account_type public.account_type,
  weekly_points bigint,
  is_me boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH my_curators AS (
    SELECT DISTINCT p.user_id AS curator_id
    FROM public.osg_artist_picks p
    WHERE p.artist_id = auth.uid()
  )
  SELECT
    mc.curator_id,
    cp.username AS curator_username,
    cp.avatar_url AS curator_avatar_url,
    p.artist_id,
    pr.username,
    pr.avatar_url,
    pr.account_type,
    COALESCE((
      SELECT count(*)::bigint
      FROM public.stream_points sp
      JOIN public.curator_playlists cpl ON cpl.id = sp.curator_playlist_id
      WHERE cpl.curator_id = mc.curator_id
        AND sp.user_id = p.artist_id
        AND sp.created_at > now() - interval '7 days'
    ), 0) AS weekly_points,
    (p.artist_id = auth.uid()) AS is_me
  FROM my_curators mc
  JOIN public.osg_artist_picks p ON p.user_id = mc.curator_id
  JOIN public.profiles pr ON pr.id = p.artist_id
  JOIN public.profiles cp ON cp.id = mc.curator_id
  ORDER BY cp.username, pr.username;
$function$;

GRANT EXECUTE ON FUNCTION public.list_my_osg_rosters() TO authenticated;
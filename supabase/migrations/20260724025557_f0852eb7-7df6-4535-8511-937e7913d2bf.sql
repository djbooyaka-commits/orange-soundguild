
ALTER TABLE public.curator_playlists ADD COLUMN IF NOT EXISTS is_osg boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS curator_playlists_one_osg_per_curator
  ON public.curator_playlists(curator_id) WHERE is_osg = true;

CREATE OR REPLACE FUNCTION public.list_my_osg_artist_picks()
 RETURNS TABLE(id uuid, artist_id uuid, username text, avatar_url text, account_type account_type, weekly_points bigint, created_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    p.id, p.artist_id, pr.username, pr.avatar_url, pr.account_type,
    COALESCE((
      SELECT count(*)::bigint
      FROM public.stream_points sp
      JOIN public.curator_playlists cp ON cp.id = sp.curator_playlist_id
      WHERE cp.curator_id = auth.uid()
        AND cp.is_osg = true
        AND sp.user_id = p.artist_id
        AND sp.created_at > now() - interval '7 days'
    ), 0) AS weekly_points,
    p.created_at
  FROM public.osg_artist_picks p
  JOIN public.profiles pr ON pr.id = p.artist_id
  WHERE p.user_id = auth.uid()
  ORDER BY pr.username;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_osg_rosters()
 RETURNS TABLE(curator_id uuid, curator_username text, curator_avatar_url text, artist_id uuid, username text, avatar_url text, account_type account_type, weekly_points bigint, is_me boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH my_curators AS (
    SELECT DISTINCT p.user_id AS curator_id
    FROM public.osg_artist_picks p
    WHERE p.artist_id = auth.uid()
  )
  SELECT
    mc.curator_id, cp.username, cp.avatar_url,
    p.artist_id, pr.username, pr.avatar_url, pr.account_type,
    COALESCE((
      SELECT count(*)::bigint
      FROM public.stream_points sp
      JOIN public.curator_playlists cpl ON cpl.id = sp.curator_playlist_id
      WHERE cpl.curator_id = mc.curator_id
        AND cpl.is_osg = true
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

CREATE OR REPLACE FUNCTION public.set_curator_playlist_is_osg(_playlist_id uuid, _is_osg boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _is_osg THEN
    UPDATE public.curator_playlists SET is_osg = false
      WHERE curator_id = auth.uid() AND is_osg = true AND id <> _playlist_id;
  END IF;
  UPDATE public.curator_playlists
    SET is_osg = _is_osg
    WHERE id = _playlist_id AND curator_id = auth.uid();
END;
$function$;

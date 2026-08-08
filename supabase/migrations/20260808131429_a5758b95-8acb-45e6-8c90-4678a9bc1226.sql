
-- Only the curator's server-side removal action may write adjustments
DROP POLICY IF EXISTS "curator manages own adjustments" ON public.osg_point_adjustments;
CREATE POLICY "curator can view own adjustments"
  ON public.osg_point_adjustments FOR SELECT TO authenticated
  USING (auth.uid() = curator_id);
REVOKE INSERT, UPDATE, DELETE ON public.osg_point_adjustments FROM authenticated;

DROP FUNCTION IF EXISTS public.list_my_osg_artist_picks();
DROP FUNCTION IF EXISTS public.list_my_osg_rosters();

CREATE OR REPLACE FUNCTION public.list_my_osg_artist_picks()
 RETURNS TABLE(id uuid, artist_id uuid, username text, avatar_url text, account_type account_type, weekly_points bigint, weekly_min integer, created_at timestamp with time zone, last_deduction_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id, p.artist_id, pr.username, pr.avatar_url, pr.account_type,
    GREATEST(0,
      COALESCE((
        SELECT count(*)::bigint
        FROM public.stream_points sp
        JOIN public.curator_playlists cp ON cp.id = sp.curator_playlist_id
        WHERE cp.curator_id = auth.uid()
          AND cp.is_osg = true
          AND sp.user_id = p.artist_id
          AND sp.created_at > now() - interval '7 days'
      ), 0)
      + COALESCE((
        SELECT sum(delta)::bigint
        FROM public.osg_point_adjustments adj
        WHERE adj.curator_id = auth.uid()
          AND adj.user_id = p.artist_id
          AND adj.created_at > now() - interval '7 days'
      ), 0)
    ) AS weekly_points,
    COALESCE(cpr.osg_weekly_min, 600) AS weekly_min,
    p.created_at,
    (
      SELECT max(adj.created_at)
      FROM public.osg_point_adjustments adj
      WHERE adj.curator_id = auth.uid()
        AND adj.user_id = p.artist_id
        AND adj.delta < 0
    ) AS last_deduction_at
  FROM public.osg_artist_picks p
  JOIN public.profiles pr ON pr.id = p.artist_id
  LEFT JOIN public.profiles cpr ON cpr.id = auth.uid()
  WHERE p.user_id = auth.uid()
  ORDER BY pr.username;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_osg_rosters()
 RETURNS TABLE(curator_id uuid, curator_username text, curator_avatar_url text, artist_id uuid, username text, avatar_url text, account_type account_type, weekly_points bigint, weekly_min integer, is_me boolean, last_deduction_at timestamp with time zone)
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
    mc.curator_id, cp.username, cp.avatar_url,
    p.artist_id, pr.username, pr.avatar_url, pr.account_type,
    GREATEST(0,
      COALESCE((
        SELECT count(*)::bigint
        FROM public.stream_points sp
        JOIN public.curator_playlists cpl ON cpl.id = sp.curator_playlist_id
        WHERE cpl.curator_id = mc.curator_id
          AND cpl.is_osg = true
          AND sp.user_id = p.artist_id
          AND sp.created_at > now() - interval '7 days'
      ), 0)
      + COALESCE((
        SELECT sum(delta)::bigint
        FROM public.osg_point_adjustments adj
        WHERE adj.curator_id = mc.curator_id
          AND adj.user_id = p.artist_id
          AND adj.created_at > now() - interval '7 days'
      ), 0)
    ) AS weekly_points,
    COALESCE(cp.osg_weekly_min, 600) AS weekly_min,
    (p.artist_id = auth.uid()) AS is_me,
    (
      SELECT max(adj.created_at)
      FROM public.osg_point_adjustments adj
      WHERE adj.curator_id = mc.curator_id
        AND adj.user_id = p.artist_id
        AND adj.delta < 0
    ) AS last_deduction_at
  FROM my_curators mc
  JOIN public.osg_artist_picks p ON p.user_id = mc.curator_id
  JOIN public.profiles pr ON pr.id = p.artist_id
  JOIN public.profiles cp ON cp.id = mc.curator_id
  ORDER BY cp.username, pr.username;
$function$;

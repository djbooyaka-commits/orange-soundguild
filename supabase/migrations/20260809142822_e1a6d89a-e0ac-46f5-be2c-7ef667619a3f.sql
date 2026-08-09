CREATE OR REPLACE FUNCTION public.get_my_stream_points()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      COALESCE((
        SELECT count(*)::bigint
        FROM public.stream_points sp
        WHERE sp.user_id = auth.uid()
      ), 0) AS earned,
      COALESCE((
        SELECT sum(cs.cost_points)::bigint
        FROM public.curator_submissions cs
        WHERE cs.submitter_user_id = auth.uid()
          AND cs.status <> 'rejected'
      ), 0) AS spent
  ), capped_osg_deductions AS (
    SELECT COALESCE(sum(GREATEST(a.adjustment, -a.osg_earned)), 0)::bigint AS total
    FROM (
      SELECT
        cp.curator_id,
        count(sp.id)::bigint AS osg_earned,
        COALESCE((
          SELECT sum(adj.delta)::bigint
          FROM public.osg_point_adjustments adj
          WHERE adj.curator_id = cp.curator_id
            AND adj.user_id = auth.uid()
            AND adj.delta < 0
        ), 0) AS adjustment
      FROM public.stream_points sp
      JOIN public.curator_playlists cp ON cp.id = sp.curator_playlist_id
      WHERE sp.user_id = auth.uid()
        AND cp.is_osg = true
      GROUP BY cp.curator_id
    ) a
  )
  SELECT GREATEST(base.earned - base.spent + capped_osg_deductions.total, 0)::integer
  FROM base
  CROSS JOIN capped_osg_deductions;
$function$;

REVOKE ALL ON FUNCTION public.get_my_stream_points() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_stream_points() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_stream_points() TO service_role;
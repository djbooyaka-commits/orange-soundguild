CREATE OR REPLACE FUNCTION public.get_my_stream_points()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT GREATEST(
    COALESCE((SELECT count(*) FROM public.stream_points WHERE user_id = auth.uid()), 0)
    - COALESCE((SELECT SUM(cost_points) FROM public.curator_submissions WHERE submitter_user_id = auth.uid()), 0)
    + COALESCE((SELECT SUM(delta) FROM public.osg_point_adjustments WHERE user_id = auth.uid()), 0),
    0
  )::integer;
$function$;

CREATE OR REPLACE FUNCTION public.get_playlist_available_points(_playlist_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH target AS (
    SELECT curator_id FROM public.curator_playlists WHERE id = _playlist_id
  ),
  raw AS (
    SELECT cp.id,
      GREATEST(
        (SELECT COALESCE(count(*), 0)::integer FROM public.stream_points sp
          WHERE sp.user_id = auth.uid() AND sp.curator_playlist_id = cp.id)
        -
        (SELECT COALESCE(SUM(cs.cost_points), 0)::integer FROM public.curator_submissions cs
          WHERE cs.submitter_user_id = auth.uid()
            AND cs.curator_playlist_id = cp.id
            AND cs.status <> 'rejected'),
        0
      ) AS pts
    FROM public.curator_playlists cp, target t
    WHERE cp.curator_id = t.curator_id
  ),
  ordered AS (
    SELECT id, pts,
      COALESCE(SUM(pts) OVER (ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prior
    FROM raw
  ),
  deficit AS (
    SELECT GREATEST(-COALESCE((
      SELECT SUM(adj.delta) FROM public.osg_point_adjustments adj, target t
      WHERE adj.user_id = auth.uid() AND adj.curator_id = t.curator_id
    ), 0), 0)::integer AS d
  )
  SELECT GREATEST(o.pts - LEAST(o.pts, GREATEST(d.d - o.prior, 0)), 0)::integer
  FROM ordered o, deficit d
  WHERE o.id = _playlist_id;
$function$;
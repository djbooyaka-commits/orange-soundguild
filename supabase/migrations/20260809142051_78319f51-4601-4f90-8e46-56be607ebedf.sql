CREATE OR REPLACE FUNCTION public.get_my_stream_points()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT GREATEST(
    COALESCE((SELECT count(*) FROM public.stream_points WHERE user_id = auth.uid()), 0)
    - COALESCE((
        SELECT SUM(cost_points)
        FROM public.curator_submissions
        WHERE submitter_user_id = auth.uid()
          AND status <> 'rejected'
      ), 0),
    0
  )::integer;
$function$;

CREATE OR REPLACE FUNCTION public.get_playlist_available_points(_playlist_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT GREATEST(
    COALESCE((
      SELECT count(*)
      FROM public.stream_points sp
      WHERE sp.user_id = auth.uid()
        AND sp.curator_playlist_id = _playlist_id
    ), 0)
    - COALESCE((
      SELECT SUM(cs.cost_points)
      FROM public.curator_submissions cs
      WHERE cs.submitter_user_id = auth.uid()
        AND cs.curator_playlist_id = _playlist_id
        AND cs.status <> 'rejected'
    ), 0),
    0
  )::integer;
$function$;
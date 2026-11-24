CREATE OR REPLACE FUNCTION public.curator_playlist_member_balances(_playlist_id uuid)
RETURNS TABLE(user_id uuid, balance integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_curator uuid := auth.uid();
BEGIN
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.curator_playlists p WHERE p.id = _playlist_id AND p.curator_id = v_curator) THEN
    RAISE EXCEPTION 'That playlist is not yours';
  END IF;

  RETURN QUERY
  WITH members AS (
    SELECT DISTINCT ci.user_id AS uid FROM public.curator_invites ci
    WHERE ci.curator_id = v_curator AND ci.status = 'accepted'
  ),
  earned AS (
    SELECT sp.user_id AS uid, count(*)::bigint AS n FROM public.stream_points sp
    WHERE sp.curator_playlist_id = _playlist_id
      AND sp.played_at >= now() - interval '30 days'
      AND sp.user_id IN (SELECT uid FROM members)
    GROUP BY sp.user_id
  ),
  adj AS (
    SELECT a.user_id AS uid, sum(a.delta)::bigint AS n FROM public.curator_team_point_adjustments a
    WHERE a.playlist_id = _playlist_id
      AND a.created_at >= now() - interval '30 days'
      AND a.user_id IN (SELECT uid FROM members)
    GROUP BY a.user_id
  ),
  spent AS (
    SELECT cs.submitter_user_id AS uid, sum(cs.cost_points)::bigint AS n FROM public.curator_submissions cs
    WHERE cs.curator_playlist_id = _playlist_id
      AND cs.status <> 'rejected'
      AND cs.created_at >= now() - interval '30 days'
      AND cs.submitter_user_id IN (SELECT uid FROM members)
    GROUP BY cs.submitter_user_id
  )
  SELECT m.uid,
         GREATEST(COALESCE(e.n,0) + COALESCE(a.n,0) - COALESCE(s.n,0), 0)::integer
  FROM members m
  LEFT JOIN earned e ON e.uid = m.uid
  LEFT JOIN adj a ON a.uid = m.uid
  LEFT JOIN spent s ON s.uid = m.uid;
END;
$function$;

REVOKE ALL ON FUNCTION public.curator_playlist_member_balances(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.curator_playlist_member_balances(uuid) TO authenticated;
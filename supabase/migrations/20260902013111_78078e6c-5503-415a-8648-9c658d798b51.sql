CREATE OR REPLACE FUNCTION public.beta_room_points_by_playlist(p_room_id uuid, p_user_id uuid)
RETURNS TABLE(playlist_id uuid, earned bigint, spent bigint, adjust bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH cutoff AS (SELECT now() - interval '30 days' AS ts),
  first_pl AS (
    SELECT DISTINCT ON (t.spotify_track_id) t.spotify_track_id, t.playlist_id
    FROM public.beta_room_tracks t
    WHERE t.room_id = p_room_id AND t.playlist_id IS NOT NULL
    ORDER BY t.spotify_track_id, t.created_at ASC
  ),
  e AS (
    SELECT COALESCE(sp.playlist_id, f.playlist_id) AS pid, count(*)::bigint AS n
    FROM public.beta_stream_points sp
    LEFT JOIN first_pl f ON f.spotify_track_id = sp.spotify_track_id
    CROSS JOIN cutoff c
    WHERE sp.room_id = p_room_id AND sp.user_id = p_user_id AND sp.played_at >= c.ts
    GROUP BY 1
  ),
  s AS (
    SELECT b.playlist_id AS pid, COALESCE(sum(b.cost_points),0)::bigint AS n
    FROM public.beta_submissions b CROSS JOIN cutoff c
    WHERE b.room_id = p_room_id AND b.submitter_user_id = p_user_id AND b.created_at >= c.ts
    GROUP BY 1
  ),
  a AS (
    SELECT j.playlist_id AS pid, COALESCE(sum(j.delta),0)::bigint AS n
    FROM public.beta_point_adjustments j CROSS JOIN cutoff c
    WHERE j.room_id = p_room_id AND j.user_id = p_user_id AND j.created_at >= c.ts
    GROUP BY 1
  ),
  ids AS (
    SELECT id AS pid FROM public.beta_room_playlists WHERE room_id = p_room_id
    UNION SELECT pid FROM e WHERE pid IS NOT NULL
    UNION SELECT pid FROM s WHERE pid IS NOT NULL
    UNION SELECT pid FROM a WHERE pid IS NOT NULL
  )
  SELECT ids.pid,
         COALESCE(e.n,0),
         COALESCE(s.n,0),
         COALESCE(a.n,0)
  FROM ids
  LEFT JOIN e ON e.pid = ids.pid
  LEFT JOIN s ON s.pid = ids.pid
  LEFT JOIN a ON a.pid = ids.pid
$function$;

REVOKE ALL ON FUNCTION public.beta_room_points_by_playlist(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.beta_room_points_by_playlist(uuid, uuid) TO service_role;
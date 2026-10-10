CREATE OR REPLACE FUNCTION public.beta_playlist_earned_points(p_playlist_id uuid)
 RETURNS TABLE(user_id uuid, points bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH pl AS (
    SELECT id, room_id, is_team FROM public.beta_room_playlists WHERE id = p_playlist_id
  ),
  first_pl AS (
    SELECT DISTINCT ON (t.spotify_track_id) t.spotify_track_id, t.playlist_id
    FROM public.beta_room_tracks t, pl
    WHERE t.room_id = pl.room_id AND t.playlist_id IS NOT NULL
    ORDER BY t.spotify_track_id, t.created_at ASC
  ),
  plays AS (
    SELECT sp.user_id, sp.played_at
    FROM public.beta_stream_points sp
    CROSS JOIN pl
    LEFT JOIN first_pl f ON f.spotify_track_id = sp.spotify_track_id
    WHERE sp.room_id = pl.room_id AND COALESCE(sp.playlist_id, f.playlist_id) = pl.id
  ),
  last_act AS (
    SELECT u, max(ts) AS ts FROM (
      SELECT user_id AS u, played_at AS ts FROM plays
      UNION ALL
      SELECT b.submitter_user_id, b.created_at FROM public.beta_submissions b WHERE b.playlist_id = p_playlist_id
      UNION ALL
      SELECT j.user_id, j.created_at FROM public.beta_point_adjustments j WHERE j.playlist_id = p_playlist_id AND j.delta > 0
    ) z GROUP BY u
  )
  SELECT p.user_id, count(*)::bigint
  FROM plays p CROSS JOIN pl
  JOIN last_act l ON l.u = p.user_id
  WHERE pl.is_team OR l.ts >= now() - interval '30 days'
  GROUP BY p.user_id
$function$;

CREATE OR REPLACE FUNCTION public.beta_room_points_by_playlist(p_room_id uuid, p_user_id uuid)
 RETURNS TABLE(playlist_id uuid, earned bigint, spent bigint, adjust bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH team AS (SELECT id FROM public.beta_room_playlists WHERE room_id = p_room_id AND is_team),
  first_pl AS (
    SELECT DISTINCT ON (t.spotify_track_id) t.spotify_track_id, t.playlist_id
    FROM public.beta_room_tracks t
    WHERE t.room_id = p_room_id AND t.playlist_id IS NOT NULL
    ORDER BY t.spotify_track_id, t.created_at ASC
  ),
  plays AS (
    SELECT COALESCE(sp.playlist_id, f.playlist_id) AS pid, sp.played_at
    FROM public.beta_stream_points sp
    LEFT JOIN first_pl f ON f.spotify_track_id = sp.spotify_track_id
    WHERE sp.room_id = p_room_id AND sp.user_id = p_user_id
  ),
  subs AS (
    SELECT b.playlist_id AS pid, b.cost_points, b.created_at
    FROM public.beta_submissions b
    WHERE b.room_id = p_room_id AND b.submitter_user_id = p_user_id
  ),
  adjs AS (
    SELECT j.playlist_id AS pid, j.delta, j.created_at
    FROM public.beta_point_adjustments j
    WHERE j.room_id = p_room_id AND j.user_id = p_user_id
  ),
  active AS (
    SELECT pid FROM (
      SELECT pid, played_at AS ts FROM plays
      UNION ALL SELECT pid, created_at FROM subs
      UNION ALL SELECT pid, created_at FROM adjs WHERE delta > 0
    ) z WHERE pid IS NOT NULL GROUP BY pid
    HAVING max(ts) >= now() - interval '30 days'
    UNION SELECT id FROM team
  ),
  e AS (SELECT pid, count(*)::bigint AS n FROM plays WHERE pid IN (SELECT pid FROM active) GROUP BY 1),
  s AS (SELECT pid, COALESCE(sum(cost_points),0)::bigint AS n FROM subs WHERE pid IN (SELECT pid FROM active) GROUP BY 1),
  a AS (
    SELECT pid, COALESCE(sum(delta),0)::bigint AS n FROM adjs
    WHERE pid IN (SELECT pid FROM active) OR created_at >= now() - interval '30 days'
    GROUP BY 1
  ),
  ids AS (
    SELECT id AS pid FROM public.beta_room_playlists WHERE room_id = p_room_id
    UNION SELECT pid FROM e UNION SELECT pid FROM s UNION SELECT pid FROM a
  )
  SELECT ids.pid, COALESCE(e.n,0), COALESCE(s.n,0), COALESCE(a.n,0)
  FROM ids LEFT JOIN e ON e.pid = ids.pid LEFT JOIN s ON s.pid = ids.pid LEFT JOIN a ON a.pid = ids.pid
$function$;
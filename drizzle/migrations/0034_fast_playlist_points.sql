CREATE INDEX IF NOT EXISTS beta_stream_points_playlist_user_idx ON public.beta_stream_points (playlist_id, user_id, played_at);
CREATE INDEX IF NOT EXISTS beta_stream_points_null_pl_idx ON public.beta_stream_points (room_id, spotify_track_id) WHERE playlist_id IS NULL;

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
    SELECT sp.user_id, sp.played_at FROM public.beta_stream_points sp
    WHERE sp.playlist_id = p_playlist_id
    UNION ALL
    SELECT sp.user_id, sp.played_at
    FROM public.beta_stream_points sp
    JOIN pl ON sp.room_id = pl.room_id
    JOIN first_pl f ON f.spotify_track_id = sp.spotify_track_id AND f.playlist_id = pl.id
    WHERE sp.playlist_id IS NULL
  ),
  agg AS (
    SELECT user_id, count(*)::bigint AS n, max(played_at) AS last_play FROM plays GROUP BY user_id
  ),
  other_act AS (
    SELECT u, max(ts) AS ts FROM (
      SELECT b.submitter_user_id AS u, b.created_at AS ts FROM public.beta_submissions b WHERE b.playlist_id = p_playlist_id
      UNION ALL
      SELECT j.user_id, j.created_at FROM public.beta_point_adjustments j WHERE j.playlist_id = p_playlist_id AND j.delta > 0
    ) z GROUP BY u
  )
  SELECT a.user_id, a.n
  FROM agg a CROSS JOIN pl
  LEFT JOIN other_act o ON o.u = a.user_id
  WHERE pl.is_team OR GREATEST(a.last_play, o.ts) >= now() - interval '30 days'
$function$;
CREATE OR REPLACE FUNCTION public.beta_playlist_earned_points(p_playlist_id uuid)
RETURNS TABLE(user_id uuid, points bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pl AS (
    SELECT id, room_id FROM public.beta_room_playlists WHERE id = p_playlist_id
  ),
  first_pl AS (
    SELECT DISTINCT ON (t.spotify_track_id) t.spotify_track_id, t.playlist_id
    FROM public.beta_room_tracks t, pl
    WHERE t.room_id = pl.room_id AND t.playlist_id IS NOT NULL
    ORDER BY t.spotify_track_id, t.created_at ASC
  )
  SELECT sp.user_id, count(*)::bigint
  FROM public.beta_stream_points sp
  CROSS JOIN pl
  LEFT JOIN first_pl f ON f.spotify_track_id = sp.spotify_track_id
  WHERE sp.room_id = pl.room_id
    AND COALESCE(sp.playlist_id, f.playlist_id) = pl.id
  GROUP BY sp.user_id
$$;

REVOKE ALL ON FUNCTION public.beta_playlist_earned_points(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beta_playlist_earned_points(uuid) TO authenticated, service_role;
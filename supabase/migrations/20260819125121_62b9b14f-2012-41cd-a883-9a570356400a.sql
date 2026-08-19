ALTER TABLE public.beta_stream_points
  ADD COLUMN IF NOT EXISTS playlist_id uuid REFERENCES public.beta_room_playlists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS beta_stream_points_playlist_idx
  ON public.beta_stream_points (playlist_id);

-- Backfill: attribute each existing play to exactly one playlist
UPDATE public.beta_stream_points sp
SET playlist_id = pick.playlist_id
FROM (
  SELECT DISTINCT ON (t.room_id, t.spotify_track_id)
         t.room_id, t.spotify_track_id, t.playlist_id
  FROM public.beta_room_tracks t
  WHERE t.playlist_id IS NOT NULL
  ORDER BY t.room_id, t.spotify_track_id, t.created_at ASC
) pick
WHERE sp.playlist_id IS NULL
  AND sp.room_id = pick.room_id
  AND sp.spotify_track_id = pick.spotify_track_id;
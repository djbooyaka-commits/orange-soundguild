ALTER TABLE public.beta_room_tracks DROP CONSTRAINT IF EXISTS beta_room_tracks_room_id_spotify_track_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS beta_room_tracks_room_playlist_track_key
  ON public.beta_room_tracks (room_id, playlist_id, spotify_track_id);
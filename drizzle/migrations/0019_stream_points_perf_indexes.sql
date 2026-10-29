CREATE INDEX IF NOT EXISTS beta_stream_points_room_played_idx ON public.beta_stream_points (room_id, played_at DESC);
CREATE INDEX IF NOT EXISTS beta_stream_points_user_room_idx ON public.beta_stream_points (user_id, room_id);
CREATE INDEX IF NOT EXISTS stream_points_playlist_played_idx ON public.stream_points (curator_playlist_id, played_at DESC);
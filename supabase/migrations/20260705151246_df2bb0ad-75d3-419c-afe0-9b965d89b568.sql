ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS album TEXT,
  ADD COLUMN IF NOT EXISTS track_number INTEGER;

CREATE INDEX IF NOT EXISTS tracks_user_album_idx
  ON public.tracks (user_id, album, track_number);
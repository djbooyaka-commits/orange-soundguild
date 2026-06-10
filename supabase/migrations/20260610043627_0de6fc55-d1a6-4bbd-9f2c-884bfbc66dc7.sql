
ALTER TABLE public.playlist_tracks DROP CONSTRAINT IF EXISTS playlist_tracks_track_id_fkey;
ALTER TABLE public.playlist_tracks ALTER COLUMN track_id TYPE text USING track_id::text;

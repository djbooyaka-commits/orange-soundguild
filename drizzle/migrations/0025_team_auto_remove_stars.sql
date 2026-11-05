ALTER TABLE public.beta_room_playlists ADD COLUMN IF NOT EXISTS auto_remove_stars integer;

CREATE TABLE public.beta_playlist_auto_removals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.beta_room_playlists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  spotify_track_id text NOT NULL,
  removed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, user_id, spotify_track_id)
);
GRANT ALL ON public.beta_playlist_auto_removals TO service_role;
ALTER TABLE public.beta_playlist_auto_removals ENABLE ROW LEVEL SECURITY;
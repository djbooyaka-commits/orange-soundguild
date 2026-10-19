CREATE TABLE public.beta_playlist_member_targets (
  playlist_id uuid NOT NULL REFERENCES public.beta_room_playlists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  target_min integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, user_id)
);
GRANT ALL ON public.beta_playlist_member_targets TO service_role;
ALTER TABLE public.beta_playlist_member_targets ENABLE ROW LEVEL SECURITY;
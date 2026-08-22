CREATE TABLE public.beta_playlist_tracking_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.beta_room_playlists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  stopped_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT beta_playlist_tracking_sessions_time_check CHECK (stopped_at IS NULL OR stopped_at >= started_at)
);

GRANT ALL ON public.beta_playlist_tracking_sessions TO service_role;

ALTER TABLE public.beta_playlist_tracking_sessions ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX beta_playlist_tracking_one_active_idx
  ON public.beta_playlist_tracking_sessions (playlist_id, user_id)
  WHERE stopped_at IS NULL;

CREATE INDEX beta_playlist_tracking_user_playlist_idx
  ON public.beta_playlist_tracking_sessions (user_id, playlist_id, started_at DESC);

CREATE TRIGGER beta_playlist_tracking_touch_updated_at
  BEFORE UPDATE ON public.beta_playlist_tracking_sessions
  FOR EACH ROW EXECUTE FUNCTION public.beta_touch_updated_at();
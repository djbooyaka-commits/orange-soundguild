CREATE TABLE public.beta_room_lastfm_accounts (
  room_id uuid NOT NULL REFERENCES public.beta_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  lastfm_username text NOT NULL CHECK (char_length(lastfm_username) BETWEEN 1 AND 50),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
GRANT ALL ON public.beta_room_lastfm_accounts TO service_role;
ALTER TABLE public.beta_room_lastfm_accounts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.beta_room_lastfm_accounts IS 'Optional per-room Last.fm username; overrides lastfm_connections for that room only. Server-only access.';
CREATE TABLE public.spotify_user_apps (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.spotify_user_apps TO service_role;
-- No grants to authenticated: reads/writes go through server functions only.

ALTER TABLE public.spotify_user_apps ENABLE ROW LEVEL SECURITY;

-- Fail-closed: no policies. Only service_role (server) can touch this.

CREATE TABLE public.lastfm_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lastfm_username text NOT NULL,
  last_polled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.lastfm_connections TO service_role;
ALTER TABLE public.lastfm_connections ENABLE ROW LEVEL SECURITY;
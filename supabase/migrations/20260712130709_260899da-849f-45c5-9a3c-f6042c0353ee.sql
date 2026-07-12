
-- 1) curator_playlists: playlists submitted by Superfans
CREATE TABLE public.curator_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spotify_playlist_id TEXT NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (curator_id, spotify_playlist_id)
);
CREATE INDEX curator_playlists_spotify_id_idx ON public.curator_playlists(spotify_playlist_id);

GRANT SELECT ON public.curator_playlists TO anon, authenticated;
GRANT INSERT, DELETE ON public.curator_playlists TO authenticated;
GRANT ALL ON public.curator_playlists TO service_role;

ALTER TABLE public.curator_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Curator playlists are publicly readable"
  ON public.curator_playlists FOR SELECT
  USING (true);

CREATE POLICY "Superfans manage their own curator playlists"
  ON public.curator_playlists FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = curator_id
    AND (SELECT account_type::text FROM public.profiles WHERE id = auth.uid()) = 'superfan'
  );

CREATE POLICY "Curators delete their own playlists"
  ON public.curator_playlists FOR DELETE
  TO authenticated
  USING (auth.uid() = curator_id);

-- 2) spotify_connections: per-user Spotify OAuth tokens (server-only reads)
CREATE TABLE public.spotify_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  spotify_user_id TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  last_polled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No anon/authenticated grants; only service_role via server functions
GRANT ALL ON public.spotify_connections TO service_role;

ALTER TABLE public.spotify_connections ENABLE ROW LEVEL SECURITY;
-- No policies = locked to service_role only

-- 3) stream_points: verified full streams
CREATE TABLE public.stream_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  curator_playlist_id UUID NOT NULL REFERENCES public.curator_playlists(id) ON DELETE CASCADE,
  spotify_track_id TEXT NOT NULL,
  spotify_track_name TEXT,
  played_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, spotify_track_id, played_at)
);
CREATE INDEX stream_points_user_idx ON public.stream_points(user_id);
CREATE INDEX stream_points_playlist_idx ON public.stream_points(curator_playlist_id);

GRANT SELECT ON public.stream_points TO authenticated;
GRANT ALL ON public.stream_points TO service_role;

ALTER TABLE public.stream_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own stream points"
  ON public.stream_points FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Curators see stream points on their playlists"
  ON public.stream_points FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.curator_playlists cp
      WHERE cp.id = stream_points.curator_playlist_id
        AND cp.curator_id = auth.uid()
    )
  );

-- Helpers
CREATE OR REPLACE FUNCTION public.get_my_stream_points()
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(count(*), 0)::integer FROM public.stream_points WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_curator_earned_points()
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(count(*), 0)::integer
  FROM public.stream_points sp
  JOIN public.curator_playlists cp ON cp.id = sp.curator_playlist_id
  WHERE cp.curator_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_playlist_earned_points(_playlist_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(count(*), 0)::integer
  FROM public.stream_points sp
  JOIN public.curator_playlists cp ON cp.id = sp.curator_playlist_id
  WHERE cp.id = _playlist_id
    AND (cp.curator_id = auth.uid() OR sp.user_id = auth.uid());
$$;

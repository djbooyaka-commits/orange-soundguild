
CREATE TABLE IF NOT EXISTS public.curator_playlist_ignores (
  curator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spotify_playlist_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (curator_id, spotify_playlist_id)
);
GRANT SELECT, INSERT, DELETE ON public.curator_playlist_ignores TO authenticated;
GRANT ALL ON public.curator_playlist_ignores TO service_role;
ALTER TABLE public.curator_playlist_ignores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ignores read" ON public.curator_playlist_ignores FOR SELECT TO authenticated USING (auth.uid() = curator_id);
CREATE POLICY "own ignores insert" ON public.curator_playlist_ignores FOR INSERT TO authenticated WITH CHECK (auth.uid() = curator_id);
CREATE POLICY "own ignores delete" ON public.curator_playlist_ignores FOR DELETE TO authenticated USING (auth.uid() = curator_id);

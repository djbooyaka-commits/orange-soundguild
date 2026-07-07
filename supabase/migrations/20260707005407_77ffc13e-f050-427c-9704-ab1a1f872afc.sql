-- Restrict track row reads to authenticated users so raw storage paths
-- (audio_url, cover_art_url) are not exposed to anonymous clients.
DROP POLICY IF EXISTS "Tracks are viewable by everyone" ON public.tracks;

CREATE POLICY "Tracks are viewable by authenticated users"
ON public.tracks
FOR SELECT
TO authenticated
USING (true);

REVOKE SELECT ON public.tracks FROM anon;
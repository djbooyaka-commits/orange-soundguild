-- Allow public pages to read track rows used by the public music feed.
-- Mutations remain controlled by the existing authenticated/owner/admin policies.
DROP POLICY IF EXISTS "Tracks are publicly readable" ON public.tracks;
CREATE POLICY "Tracks are publicly readable"
ON public.tracks
FOR SELECT
TO anon, authenticated
USING (true);

GRANT SELECT ON TABLE public.tracks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tracks TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.tracks TO service_role;
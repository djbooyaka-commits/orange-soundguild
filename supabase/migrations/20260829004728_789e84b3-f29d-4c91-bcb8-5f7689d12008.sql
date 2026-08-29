-- Consolidate duplicate public read policies on tracks
DROP POLICY IF EXISTS "Tracks are viewable by authenticated users" ON public.tracks;

-- Ensure no broad table-level read access; only explicit safe columns
REVOKE SELECT ON public.tracks FROM anon, authenticated;
REVOKE SELECT (download_lossless_url) ON public.tracks FROM anon, authenticated;

GRANT SELECT (
  id, user_id, title, genre, audio_url, cover_art_url,
  created_at, plays_count, album, track_number, price_cents
) ON public.tracks TO anon, authenticated;

GRANT ALL ON public.tracks TO service_role;
REVOKE SELECT ON public.tracks FROM anon, authenticated;

GRANT SELECT (id, user_id, title, genre, audio_url, cover_art_url, created_at, plays_count, album, track_number, price_cents) ON public.tracks TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.tracks TO authenticated;
GRANT ALL ON public.tracks TO service_role;
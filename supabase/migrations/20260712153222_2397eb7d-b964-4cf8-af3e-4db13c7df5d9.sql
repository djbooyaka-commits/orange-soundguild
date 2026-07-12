-- Restrict the paid lossless download URL from being read via the Data API.
-- Column privileges are enforced on top of RLS; the anon/authenticated roles
-- lose access to download_lossless_url. Server code uses service_role
-- (supabaseAdmin) to read it after verifying ownership/purchase.
REVOKE SELECT (download_lossless_url) ON public.tracks FROM anon;
REVOKE SELECT (download_lossless_url) ON public.tracks FROM authenticated;
-- Explicitly grant SELECT on the remaining public columns so PostgREST
-- keeps working for anon/authenticated (Supabase's default grants covered
-- the whole table; column-level revokes make the remaining privileges
-- column-scoped, so we re-list them).
GRANT SELECT (id, user_id, title, genre, audio_url, cover_art_url, created_at, plays_count, album, track_number, price_cents) ON public.tracks TO anon, authenticated;
-- Writes stay unchanged (RLS-gated by owner policies).
GRANT INSERT, UPDATE, DELETE ON public.tracks TO authenticated;
GRANT ALL ON public.tracks TO service_role;
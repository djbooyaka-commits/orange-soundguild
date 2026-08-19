ALTER TABLE public.beta_playlist_member_links
  ADD COLUMN IF NOT EXISTS track2_url text,
  ADD COLUMN IF NOT EXISTS track2_name text;
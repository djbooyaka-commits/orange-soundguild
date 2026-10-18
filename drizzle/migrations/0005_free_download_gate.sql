ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS free_download boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_download_limit integer,
  ADD COLUMN IF NOT EXISTS free_download_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS download_gate jsonb NOT NULL DEFAULT '[]'::jsonb;
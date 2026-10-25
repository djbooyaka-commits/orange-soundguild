ALTER TABLE public.beta_room_playlists ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'spotify';
ALTER TABLE public.beta_room_playlists ADD COLUMN IF NOT EXISTS external_url text;
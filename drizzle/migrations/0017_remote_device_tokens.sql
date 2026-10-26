ALTER TABLE public.remote_devices
  ADD COLUMN device_token_hash text,
  ADD COLUMN watch_until timestamptz,
  ADD COLUMN pairing_expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour';
ALTER TABLE public.remote_devices ALTER COLUMN pairing_code SET DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
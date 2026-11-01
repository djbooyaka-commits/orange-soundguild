CREATE TABLE public.remote_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.remote_devices(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  app text NOT NULL,
  package text,
  title text NOT NULL,
  artist text,
  album text,
  played_seconds integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, started_at, title)
);
CREATE INDEX remote_plays_owner_idx ON public.remote_plays (owner_id, started_at DESC);
CREATE INDEX remote_plays_device_idx ON public.remote_plays (device_id, started_at DESC);
GRANT SELECT, DELETE ON public.remote_plays TO authenticated;
GRANT ALL ON public.remote_plays TO service_role;
ALTER TABLE public.remote_plays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their phone plays" ON public.remote_plays FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owners delete their phone plays" ON public.remote_plays FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TABLE public.remote_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'My Android phone',
  pairing_code text NOT NULL DEFAULT upper(substr(md5(random()::text), 1, 6)),
  paired boolean NOT NULL DEFAULT false,
  screen_width int NOT NULL DEFAULT 1080,
  screen_height int NOT NULL DEFAULT 2400,
  last_frame text,
  last_seen timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.remote_devices TO authenticated;
GRANT ALL ON public.remote_devices TO service_role;
ALTER TABLE public.remote_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all devices" ON public.remote_devices FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.remote_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.remote_devices(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  result text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX remote_commands_device_idx ON public.remote_commands(device_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.remote_commands TO authenticated;
GRANT ALL ON public.remote_commands TO service_role;
ALTER TABLE public.remote_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all commands" ON public.remote_commands FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id AND EXISTS (SELECT 1 FROM public.remote_devices d WHERE d.id = device_id AND d.owner_id = auth.uid()));

-- Phone app (signed in as the same account) pairs using the code shown on the site
CREATE OR REPLACE FUNCTION public.pair_remote_device(p_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  UPDATE public.remote_devices SET paired = true, last_seen = now()
   WHERE owner_id = auth.uid() AND pairing_code = upper(trim(p_code)) AND paired = false
   RETURNING id INTO v;
  IF v IS NULL THEN RAISE EXCEPTION 'Invalid pairing code'; END IF;
  RETURN v;
END $$;
REVOKE EXECUTE ON FUNCTION public.pair_remote_device(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pair_remote_device(text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.remote_devices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.remote_commands;
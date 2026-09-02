CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE public.scheduled_job_secrets (
  name text PRIMARY KEY,
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.scheduled_job_secrets TO service_role;
ALTER TABLE public.scheduled_job_secrets ENABLE ROW LEVEL SECURITY;

INSERT INTO public.scheduled_job_secrets (name, secret)
VALUES ('spotify-points-hourly', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

SELECT cron.schedule(
  'sync-spotify-points-hourly',
  '0 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://project--9a7ba628-0768-4d89-a2be-c5c8fa4fefa8.lovable.app/api/public/hooks/sync-spotify-points',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT secret FROM public.scheduled_job_secrets WHERE name = 'spotify-points-hourly')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $job$
);
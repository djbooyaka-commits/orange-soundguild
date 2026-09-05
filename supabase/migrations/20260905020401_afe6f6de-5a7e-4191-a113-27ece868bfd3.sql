CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

INSERT INTO public.scheduled_job_secrets (name, secret)
VALUES
  ('cleanup-chat-media', encode(extensions.gen_random_bytes(32), 'hex')),
  ('cleanup-chat-links', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

SELECT cron.schedule(
  'cleanup-chat-media-daily',
  '0 3 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://project--9a7ba628-0768-4d89-a2be-c5c8fa4fefa8.lovable.app/api/public/hooks/cleanup-chat-media',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT secret FROM public.scheduled_job_secrets WHERE name = 'cleanup-chat-media')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $job$
);

SELECT cron.schedule(
  'cleanup-chat-links-daily',
  '0 4 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://project--9a7ba628-0768-4d89-a2be-c5c8fa4fefa8.lovable.app/api/public/hooks/cleanup-chat-links',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT secret FROM public.scheduled_job_secrets WHERE name = 'cleanup-chat-links')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $job$
);
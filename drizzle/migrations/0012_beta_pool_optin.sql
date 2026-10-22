ALTER TABLE public.beta_room_playlists ADD COLUMN IF NOT EXISTS accept_pool_submissions boolean NOT NULL DEFAULT false;
ALTER TABLE public.beta_submissions ADD COLUMN IF NOT EXISTS daily_pass boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.artist_daily_pass_available()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.account_type = 'artist')
     AND NOT EXISTS (SELECT 1 FROM public.curator_submissions cs
                     WHERE cs.submitter_user_id = auth.uid() AND cs.daily_pass
                       AND cs.status <> 'rejected'
                       AND cs.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
     AND NOT EXISTS (SELECT 1 FROM public.beta_submissions bs
                     WHERE bs.submitter_user_id = auth.uid() AND bs.daily_pass
                       AND bs.status <> 'rejected'
                       AND bs.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
$function$;
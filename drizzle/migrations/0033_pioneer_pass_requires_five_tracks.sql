CREATE OR REPLACE FUNCTION public.my_uploaded_track_count()
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT count(*)::int FROM public.tracks t WHERE t.user_id = auth.uid();
$function$;
REVOKE ALL ON FUNCTION public.my_uploaded_track_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_uploaded_track_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.artist_daily_pass_available()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE (SELECT p.account_type::text FROM public.profiles p WHERE p.id = auth.uid())
    WHEN 'artist' THEN
      NOT EXISTS (SELECT 1 FROM public.curator_submissions cs
                  WHERE cs.submitter_user_id = auth.uid() AND cs.daily_pass AND cs.status <> 'rejected'
                    AND cs.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
      AND NOT EXISTS (SELECT 1 FROM public.beta_submissions bs
                  WHERE bs.submitter_user_id = auth.uid() AND bs.daily_pass AND bs.status <> 'rejected'
                    AND bs.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
    WHEN 'pioneer' THEN
      (SELECT count(*) FROM public.tracks t WHERE t.user_id = auth.uid()) >= 5
      AND NOT EXISTS (SELECT 1 FROM public.curator_submissions cs
                  WHERE cs.submitter_user_id = auth.uid() AND cs.daily_pass AND cs.status <> 'rejected'
                    AND cs.created_at > now() - interval '15 days')
      AND NOT EXISTS (SELECT 1 FROM public.beta_submissions bs
                  WHERE bs.submitter_user_id = auth.uid() AND bs.daily_pass AND bs.status <> 'rejected'
                    AND bs.created_at > now() - interval '15 days')
    ELSE false
  END;
$function$;
GRANT EXECUTE ON FUNCTION public.artist_daily_pass_available() TO authenticated;
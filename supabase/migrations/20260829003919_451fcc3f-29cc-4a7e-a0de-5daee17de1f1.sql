DROP FUNCTION IF EXISTS public.list_playlists_for_submission();

CREATE OR REPLACE FUNCTION public.list_playlists_for_submission()
 RETURNS TABLE(id uuid, curator_id uuid, curator_username text, spotify_playlist_id text, name text, image_url text, available_points integer, daily_submission_limit integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT cp.id, cp.curator_id, p.username,
         cp.spotify_playlist_id, cp.name, cp.image_url,
         public.get_playlist_available_points(cp.id),
         COALESCE(cp.daily_submission_limit, 3)
  FROM public.curator_playlists cp
  JOIN public.profiles p ON p.id = cp.curator_id
  WHERE cp.curator_id <> auth.uid()
    AND COALESCE(cp.is_osg, false) = false
    AND public.is_accepted_invitee(cp.curator_id, auth.uid());
$function$;

REVOKE ALL ON FUNCTION public.list_playlists_for_submission() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_playlists_for_submission() TO authenticated;
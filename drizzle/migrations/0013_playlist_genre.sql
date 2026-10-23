ALTER TABLE public.curator_playlists ADD COLUMN IF NOT EXISTS genre text;
ALTER TABLE public.beta_room_playlists ADD COLUMN IF NOT EXISTS genre text;
DROP FUNCTION IF EXISTS public.list_pool_playlists();
CREATE FUNCTION public.list_pool_playlists()
 RETURNS TABLE(id uuid, curator_id uuid, curator_username text, spotify_playlist_id text, name text, image_url text, available_points integer, daily_submission_limit integer, track_hold_days integer, genre text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT cp.id, cp.curator_id, p.username, cp.spotify_playlist_id, cp.name, cp.image_url,
         CASE WHEN auth.uid() IS NULL THEN 0 ELSE public.get_playlist_available_points(cp.id) END,
         COALESCE(cp.daily_submission_limit, 3), cp.track_hold_days, cp.genre
  FROM public.curator_playlists cp JOIN public.profiles p ON p.id = cp.curator_id
  WHERE cp.accept_pool_submissions = true AND COALESCE(cp.is_osg,false) = false AND COALESCE(cp.is_team,false) = false
  ORDER BY cp.name;
$$;
GRANT EXECUTE ON FUNCTION public.list_pool_playlists() TO authenticated;
CREATE OR REPLACE FUNCTION public.set_curator_playlist_genre(_playlist_id uuid, _genre text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.curator_playlists SET genre = NULLIF(left(trim(coalesce(_genre,'')), 40), '')
  WHERE id = _playlist_id AND curator_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Playlist not found'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.set_curator_playlist_genre(uuid, text) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_my_curator_team_rooms()
RETURNS TABLE (
  playlist_id uuid,
  curator_id uuid,
  curator_username text,
  name text,
  image_url text,
  spotify_playlist_id text,
  team_weekly_min integer,
  is_owner boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cp.id, cp.curator_id, pr.username, cp.name, cp.image_url, cp.spotify_playlist_id,
         cp.team_weekly_min, (cp.curator_id = auth.uid())
  FROM public.curator_playlists cp
  LEFT JOIN public.profiles pr ON pr.id = cp.curator_id
  WHERE cp.is_team = true
    AND cp.is_osg IS NOT TRUE
    AND auth.uid() IS NOT NULL
    AND (
      cp.curator_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.curator_team_members m WHERE m.playlist_id = cp.id AND m.user_id = auth.uid())
    )
  ORDER BY cp.created_at;
$$;
REVOKE ALL ON FUNCTION public.list_my_curator_team_rooms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_curator_team_rooms() TO authenticated, service_role;
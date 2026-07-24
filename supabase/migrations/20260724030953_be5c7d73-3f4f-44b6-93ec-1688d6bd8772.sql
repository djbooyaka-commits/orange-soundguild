CREATE OR REPLACE FUNCTION public.list_osg_playlists_for_submission()
RETURNS TABLE(
  id uuid,
  curator_id uuid,
  curator_username text,
  spotify_playlist_id text,
  name text,
  image_url text,
  available_points integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.id, cp.curator_id, p.username,
         cp.spotify_playlist_id, cp.name, cp.image_url,
         public.get_playlist_available_points(cp.id)
  FROM public.curator_playlists cp
  JOIN public.profiles p ON p.id = cp.curator_id
  WHERE cp.is_osg = true
    AND cp.curator_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.osg_artist_picks pk
      WHERE pk.user_id = cp.curator_id AND pk.artist_id = auth.uid()
    )
    AND public.is_accepted_invitee(cp.curator_id, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.list_osg_playlist_submissions()
RETURNS TABLE(
  curator_id uuid,
  submitter_user_id uuid,
  spotify_track_id text,
  spotify_track_url text,
  spotify_track_name text,
  status curator_submission_status,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH visible AS (
    SELECT cp.id AS playlist_id, cp.curator_id
    FROM public.curator_playlists cp
    WHERE cp.is_osg = true
      AND (
        cp.curator_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.osg_artist_picks p
          WHERE p.user_id = cp.curator_id AND p.artist_id = auth.uid()
        )
      )
  )
  SELECT DISTINCT ON (s.curator_id, s.submitter_user_id)
    s.curator_id, s.submitter_user_id,
    s.spotify_track_id, s.spotify_track_url, s.spotify_track_name,
    s.status, s.created_at
  FROM public.curator_submissions s
  JOIN visible v ON v.playlist_id = s.curator_playlist_id
  ORDER BY s.curator_id, s.submitter_user_id, s.created_at DESC;
$$;
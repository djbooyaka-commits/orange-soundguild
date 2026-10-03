ALTER TABLE public.curator_submissions
  ADD COLUMN IF NOT EXISTS added_to_spotify boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS spotify_error text;

UPDATE public.curator_submissions SET added_to_spotify = true WHERE status = 'approved';

DROP FUNCTION IF EXISTS public.list_curator_submissions_for_me();
CREATE FUNCTION public.list_curator_submissions_for_me()
RETURNS TABLE(
  id uuid, curator_playlist_id uuid, playlist_name text,
  submitter_user_id uuid, submitter_username text,
  spotify_track_id text, spotify_track_url text, spotify_track_name text,
  cost_points int, followed_all_artists boolean,
  status public.curator_submission_status, curator_note text,
  created_at timestamptz, reviewed_at timestamptz,
  added_to_spotify boolean, spotify_error text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.curator_playlist_id, cp.name,
         s.submitter_user_id, p.username,
         s.spotify_track_id, s.spotify_track_url, s.spotify_track_name,
         s.cost_points, s.followed_all_artists,
         s.status, s.curator_note, s.created_at, s.reviewed_at,
         s.added_to_spotify, s.spotify_error
  FROM public.curator_submissions s
  JOIN public.curator_playlists cp ON cp.id = s.curator_playlist_id
  JOIN public.profiles p ON p.id = s.submitter_user_id
  WHERE s.curator_id = auth.uid()
  ORDER BY s.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.list_curator_submissions_for_me() TO authenticated;
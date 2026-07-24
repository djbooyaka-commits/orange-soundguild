
CREATE OR REPLACE FUNCTION public.submit_osg_curator_track(
  _playlist_id uuid,
  _spotify_track_id text,
  _spotify_track_url text,
  _spotify_track_name text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_curator uuid;
  v_is_osg boolean;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _spotify_track_id IS NULL OR length(btrim(_spotify_track_id)) = 0 THEN
    RAISE EXCEPTION 'Missing track id';
  END IF;

  SELECT curator_id, COALESCE(is_osg, false)
    INTO v_curator, v_is_osg
  FROM public.curator_playlists
  WHERE id = _playlist_id;
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Playlist not found'; END IF;
  IF NOT v_is_osg THEN RAISE EXCEPTION 'Not an OSG Artists playlist'; END IF;
  IF v_curator = v_user THEN RAISE EXCEPTION 'You cannot submit to your own playlist'; END IF;

  IF NOT public.is_accepted_invitee(v_curator, v_user) THEN
    RAISE EXCEPTION 'You are not enrolled with this curator';
  END IF;

  INSERT INTO public.curator_submissions (
    curator_playlist_id, submitter_user_id, curator_id,
    spotify_track_id, spotify_track_url, spotify_track_name,
    cost_points, followed_all_artists
  )
  VALUES (
    _playlist_id, v_user, v_curator,
    _spotify_track_id, _spotify_track_url, _spotify_track_name,
    0, false
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_osg_curator_track(uuid, text, text, text) TO authenticated;

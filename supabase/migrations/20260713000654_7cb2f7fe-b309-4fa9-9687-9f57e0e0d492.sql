CREATE OR REPLACE FUNCTION public.submit_curator_track(_playlist_id uuid, _spotify_track_id text, _spotify_track_url text, _spotify_track_name text, _followed_all boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_curator uuid;
  v_cost int;
  v_avail int;
  v_recent int;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _spotify_track_id IS NULL OR length(btrim(_spotify_track_id)) = 0 THEN
    RAISE EXCEPTION 'Missing track id';
  END IF;

  SELECT curator_id INTO v_curator
  FROM public.curator_playlists
  WHERE id = _playlist_id;
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Playlist not found'; END IF;
  IF v_curator = v_user THEN RAISE EXCEPTION 'You cannot submit to your own playlist'; END IF;

  IF NOT public.is_accepted_invitee(v_curator, v_user) THEN
    RAISE EXCEPTION 'You are not enrolled with this curator';
  END IF;

  -- Rate limit: at most 2 submissions per playlist in any rolling 24h window
  SELECT count(*) INTO v_recent
  FROM public.curator_submissions
  WHERE submitter_user_id = v_user
    AND curator_playlist_id = _playlist_id
    AND created_at > now() - interval '24 hours';
  IF v_recent >= 2 THEN
    RAISE EXCEPTION 'Limit reached: you can submit at most 2 tracks to this playlist every 24 hours';
  END IF;

  v_cost := CASE WHEN _followed_all THEN 45 ELSE 50 END;

  v_avail := public.get_playlist_available_points(_playlist_id);
  IF v_avail < v_cost THEN
    RAISE EXCEPTION 'Not enough points on this playlist (need %, have %)', v_cost, v_avail;
  END IF;

  INSERT INTO public.curator_submissions (
    curator_playlist_id, submitter_user_id, curator_id,
    spotify_track_id, spotify_track_url, spotify_track_name,
    cost_points, followed_all_artists
  )
  VALUES (
    _playlist_id, v_user, v_curator,
    _spotify_track_id, _spotify_track_url, _spotify_track_name,
    v_cost, _followed_all
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
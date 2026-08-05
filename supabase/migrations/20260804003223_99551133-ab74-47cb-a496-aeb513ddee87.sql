ALTER TABLE public.curator_playlists
  ADD COLUMN IF NOT EXISTS track_hold_days integer NOT NULL DEFAULT 30;

CREATE OR REPLACE FUNCTION public.curator_set_track_hold_days(_playlist_id uuid, _days integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_days int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_days := GREATEST(0, LEAST(365, COALESCE(_days, 0)));

  UPDATE public.curator_playlists
     SET track_hold_days = v_days
   WHERE id = _playlist_id AND curator_id = v_user;

  IF NOT FOUND THEN RAISE EXCEPTION 'Playlist not found'; END IF;
  RETURN v_days;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.curator_set_track_hold_days(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_track_hold_window(_playlist_id uuid, _spotify_track_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_days int;
  v_last timestamptz;
BEGIN
  SELECT COALESCE(track_hold_days, 0) INTO v_days
  FROM public.curator_playlists WHERE id = _playlist_id;

  IF COALESCE(v_days, 0) <= 0 THEN RETURN; END IF;

  SELECT max(created_at) INTO v_last
  FROM public.curator_submissions
  WHERE curator_playlist_id = _playlist_id
    AND spotify_track_id = _spotify_track_id
    AND COALESCE(status, 'pending') <> 'rejected';

  IF v_last IS NOT NULL AND v_last > now() - make_interval(days => v_days) THEN
    RAISE EXCEPTION 'This track can be submitted again after % (playlist hold is % days)',
      to_char((v_last + make_interval(days => v_days)) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI UTC'), v_days;
  END IF;
END;
$function$;

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

  SELECT count(*) INTO v_recent
  FROM public.curator_submissions
  WHERE submitter_user_id = v_user
    AND curator_playlist_id = _playlist_id
    AND created_at > now() - interval '24 hours';
  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'Limit reached: you can submit at most 3 tracks to this playlist every 24 hours';
  END IF;

  PERFORM public.assert_track_hold_window(_playlist_id, _spotify_track_id);

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

CREATE OR REPLACE FUNCTION public.submit_osg_curator_track(_playlist_id uuid, _spotify_track_id text, _spotify_track_url text, _spotify_track_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  PERFORM public.assert_track_hold_window(_playlist_id, _spotify_track_id);

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
$function$;
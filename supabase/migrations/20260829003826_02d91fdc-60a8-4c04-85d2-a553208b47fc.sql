ALTER TABLE public.curator_playlists
  ADD COLUMN IF NOT EXISTS daily_submission_limit integer NOT NULL DEFAULT 3;

ALTER TABLE public.curator_playlists
  DROP CONSTRAINT IF EXISTS curator_playlists_daily_limit_range;
ALTER TABLE public.curator_playlists
  ADD CONSTRAINT curator_playlists_daily_limit_range CHECK (daily_submission_limit BETWEEN 1 AND 6);

ALTER TABLE public.beta_rooms
  ADD COLUMN IF NOT EXISTS daily_submission_limit integer NOT NULL DEFAULT 2;

ALTER TABLE public.beta_rooms
  DROP CONSTRAINT IF EXISTS beta_rooms_daily_limit_range;
ALTER TABLE public.beta_rooms
  ADD CONSTRAINT beta_rooms_daily_limit_range CHECK (daily_submission_limit BETWEEN 1 AND 6);

CREATE OR REPLACE FUNCTION public.curator_set_daily_submission_limit(_playlist_id uuid, _limit integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_limit int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_limit := GREATEST(1, LEAST(6, COALESCE(_limit, 1)));

  UPDATE public.curator_playlists
     SET daily_submission_limit = v_limit
   WHERE id = _playlist_id AND curator_id = v_user;

  IF NOT FOUND THEN RAISE EXCEPTION 'Playlist not found'; END IF;
  RETURN v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.curator_set_daily_submission_limit(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.curator_set_daily_submission_limit(uuid, integer) TO authenticated;

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
  v_limit int;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _spotify_track_id IS NULL OR length(btrim(_spotify_track_id)) = 0 THEN
    RAISE EXCEPTION 'Missing track id';
  END IF;

  SELECT curator_id, COALESCE(daily_submission_limit, 3)
    INTO v_curator, v_limit
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
  IF v_recent >= v_limit THEN
    RAISE EXCEPTION 'Limit reached: you can submit at most % tracks to this playlist every 24 hours', v_limit;
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
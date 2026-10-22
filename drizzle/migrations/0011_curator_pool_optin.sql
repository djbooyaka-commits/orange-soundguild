ALTER TABLE public.curator_playlists ADD COLUMN IF NOT EXISTS accept_pool_submissions boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_curator_playlist_pool(_playlist_id uuid, _on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.curator_playlists SET accept_pool_submissions = _on
  WHERE id = _playlist_id AND curator_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Playlist not found'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.set_curator_playlist_pool(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_pool_playlists()
RETURNS TABLE(id uuid, curator_id uuid, curator_username text, spotify_playlist_id text, name text, image_url text, available_points integer, daily_submission_limit integer, track_hold_days integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT cp.id, cp.curator_id, p.username, cp.spotify_playlist_id, cp.name, cp.image_url,
         CASE WHEN auth.uid() IS NULL THEN 0 ELSE public.get_playlist_available_points(cp.id) END,
         COALESCE(cp.daily_submission_limit, 3), cp.track_hold_days
  FROM public.curator_playlists cp JOIN public.profiles p ON p.id = cp.curator_id
  WHERE cp.accept_pool_submissions = true AND COALESCE(cp.is_osg,false) = false AND COALESCE(cp.is_team,false) = false
  ORDER BY cp.name;
$$;
GRANT EXECUTE ON FUNCTION public.list_pool_playlists() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.submit_curator_track(_playlist_id uuid, _spotify_track_id text, _spotify_track_url text, _spotify_track_name text, _followed_all boolean)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_curator uuid; v_cost int; v_avail int; v_recent int; v_limit int; v_id uuid; v_pool boolean;
  v_pass boolean := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _spotify_track_id IS NULL OR length(btrim(_spotify_track_id)) = 0 THEN RAISE EXCEPTION 'Missing track id'; END IF;
  SELECT curator_id, COALESCE(daily_submission_limit, 3), accept_pool_submissions INTO v_curator, v_limit, v_pool
  FROM public.curator_playlists WHERE id = _playlist_id;
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Playlist not found'; END IF;
  IF v_curator = v_user THEN RAISE EXCEPTION 'You cannot submit to your own playlist'; END IF;
  IF NOT COALESCE(v_pool,false) AND NOT public.is_accepted_invitee(v_curator, v_user) THEN RAISE EXCEPTION 'You are not enrolled with this curator'; END IF;
  SELECT count(*) INTO v_recent FROM public.curator_submissions
  WHERE submitter_user_id = v_user AND curator_playlist_id = _playlist_id AND created_at > now() - interval '24 hours';
  IF v_recent >= v_limit THEN
    RAISE EXCEPTION 'Limit reached: you can submit at most % tracks to this playlist every 24 hours', v_limit;
  END IF;
  PERFORM public.assert_track_hold_window(_playlist_id, _spotify_track_id);
  v_pass := public.artist_daily_pass_available();
  IF v_pass THEN v_cost := 0;
  ELSE
    v_cost := 50;
    v_avail := public.get_playlist_available_points(_playlist_id);
    IF v_avail < v_cost THEN
      RAISE EXCEPTION 'Not enough points on this playlist (need %, have %)', v_cost, v_avail;
    END IF;
  END IF;
  INSERT INTO public.curator_submissions (curator_playlist_id, submitter_user_id, curator_id,
    spotify_track_id, spotify_track_url, spotify_track_name, cost_points, followed_all_artists, daily_pass)
  VALUES (_playlist_id, v_user, v_curator, _spotify_track_id, _spotify_track_url, _spotify_track_name, v_cost, false, v_pass)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
ALTER TABLE public.curator_submissions ADD COLUMN IF NOT EXISTS daily_pass boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.artist_daily_pass_available()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.account_type = 'artist')
     AND NOT EXISTS (SELECT 1 FROM public.curator_submissions cs
                     WHERE cs.submitter_user_id = auth.uid() AND cs.daily_pass
                       AND cs.status <> 'rejected'
                       AND cs.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
$$;
GRANT EXECUTE ON FUNCTION public.artist_daily_pass_available() TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_curator_track(_playlist_id uuid, _spotify_track_id text, _spotify_track_url text, _spotify_track_name text, _followed_all boolean)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_curator uuid; v_cost int; v_avail int; v_recent int; v_limit int; v_id uuid;
  v_pass boolean := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _spotify_track_id IS NULL OR length(btrim(_spotify_track_id)) = 0 THEN RAISE EXCEPTION 'Missing track id'; END IF;
  SELECT curator_id, COALESCE(daily_submission_limit, 3) INTO v_curator, v_limit
  FROM public.curator_playlists WHERE id = _playlist_id;
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Playlist not found'; END IF;
  IF v_curator = v_user THEN RAISE EXCEPTION 'You cannot submit to your own playlist'; END IF;
  IF NOT public.is_accepted_invitee(v_curator, v_user) THEN RAISE EXCEPTION 'You are not enrolled with this curator'; END IF;
  SELECT count(*) INTO v_recent FROM public.curator_submissions
  WHERE submitter_user_id = v_user AND curator_playlist_id = _playlist_id AND created_at > now() - interval '24 hours';
  IF v_recent >= v_limit THEN
    RAISE EXCEPTION 'Limit reached: you can submit at most % tracks to this playlist every 24 hours', v_limit;
  END IF;
  PERFORM public.assert_track_hold_window(_playlist_id, _spotify_track_id);

  v_pass := public.artist_daily_pass_available();
  IF v_pass THEN
    v_cost := 0;
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

-- 15% of the month's artist subscription revenue, split by approved+added placements by superfan curators
CREATE OR REPLACE FUNCTION public.curator_pool_summary(p_period_start date)
 RETURNS TABLE(curator_id uuid, username text, placements bigint, pool_cents integer, total_placements bigint, share_cents integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH pool AS (
    SELECT (COALESCE(sum(CASE WHEN upper(token) IN ('PAYPAL','USD','USDC') THEN amount ELSE 0 END),0) * 100 * 0.15)::int AS cents
    FROM public.artist_subscriptions
    WHERE tier = 'artist' AND paid_at >= p_period_start AND paid_at < (p_period_start + interval '1 month')
  ), placed AS (
    SELECT cs.curator_id, count(*) AS n
    FROM public.curator_submissions cs
    JOIN public.profiles p ON p.id = cs.curator_id AND p.account_type = 'superfan'
    WHERE cs.status = 'approved' AND cs.added_to_spotify
      AND cs.reviewed_at >= p_period_start AND cs.reviewed_at < (p_period_start + interval '1 month')
    GROUP BY cs.curator_id
  ), tot AS (SELECT COALESCE(sum(n),0)::bigint AS t FROM placed)
  SELECT pl.curator_id, pr.username, pl.n, pool.cents, tot.t,
         CASE WHEN tot.t > 0 THEN floor(pool.cents * pl.n::numeric / tot.t)::int ELSE 0 END
  FROM placed pl CROSS JOIN pool CROSS JOIN tot
  LEFT JOIN public.profiles pr ON pr.id = pl.curator_id
  WHERE public.has_role(auth.uid(), 'admin') OR pl.curator_id = auth.uid()
  ORDER BY pl.n DESC;
$$;
GRANT EXECUTE ON FUNCTION public.curator_pool_summary(date) TO authenticated;
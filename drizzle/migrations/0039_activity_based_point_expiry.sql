CREATE OR REPLACE FUNCTION public.curator_member_last_activity(_playlist_id uuid, _user_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT GREATEST(
    (SELECT max(played_at) FROM public.stream_points WHERE curator_playlist_id=_playlist_id AND user_id=_user_id),
    (SELECT max(created_at) FROM public.curator_submissions WHERE curator_playlist_id=_playlist_id AND submitter_user_id=_user_id AND status<>'rejected'),
    (SELECT max(created_at) FROM public.curator_team_point_adjustments WHERE playlist_id=_playlist_id AND user_id=_user_id)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.curator_member_last_activity(uuid,uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.curator_member_balance(_playlist_id uuid, _user_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN COALESCE(public.curator_member_last_activity(_playlist_id,_user_id), '-infinity') < now() - interval '30 days' THEN 0
  ELSE GREATEST(
    COALESCE((SELECT count(*) FROM public.stream_points WHERE curator_playlist_id=_playlist_id AND user_id=_user_id),0)
    + COALESCE((SELECT sum(delta) FROM public.curator_team_point_adjustments WHERE playlist_id=_playlist_id AND user_id=_user_id),0)
    - COALESCE((SELECT sum(cost_points) FROM public.curator_submissions WHERE curator_playlist_id=_playlist_id AND submitter_user_id=_user_id AND status<>'rejected'),0)
  ,0)::integer END;
$$;
REVOKE EXECUTE ON FUNCTION public.curator_member_balance(uuid,uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_playlist_available_points(_playlist_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.curator_member_balance(_playlist_id, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.get_playlist_earned_points(_playlist_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(count(*), 0)::integer
  FROM public.stream_points sp
  JOIN public.curator_playlists cp ON cp.id = sp.curator_playlist_id
  WHERE cp.id = _playlist_id
    AND (cp.curator_id = auth.uid() OR sp.user_id = auth.uid())
    AND public.curator_member_last_activity(_playlist_id, sp.user_id) >= now() - interval '30 days';
$$;

CREATE OR REPLACE FUNCTION public.curator_playlist_member_balances(_playlist_id uuid)
RETURNS TABLE(user_id uuid, balance integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_curator uuid := auth.uid();
BEGIN
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.curator_playlists p WHERE p.id = _playlist_id AND p.curator_id = v_curator) THEN
    RAISE EXCEPTION 'That playlist is not yours';
  END IF;
  RETURN QUERY
  SELECT m.uid, public.curator_member_balance(_playlist_id, m.uid)
  FROM (SELECT DISTINCT ci.user_id AS uid FROM public.curator_invites ci
        WHERE ci.curator_id = v_curator AND ci.status = 'accepted') m;
END;
$function$;
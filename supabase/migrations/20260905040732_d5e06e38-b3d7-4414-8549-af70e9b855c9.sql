
CREATE OR REPLACE FUNCTION public.curator_adjust_playlist_points(_playlist_id uuid, _user_id uuid, _delta integer, _reason text DEFAULT NULL::text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_curator uuid := auth.uid();
  v_owner uuid;
  v_balance bigint;
  v_delta integer := _delta;
BEGIN
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _delta = 0 OR abs(_delta) > 100000 THEN RAISE EXCEPTION 'Invalid point amount'; END IF;

  SELECT curator_id INTO v_owner FROM public.curator_playlists WHERE id = _playlist_id;
  IF v_owner IS NULL OR v_owner <> v_curator THEN
    RAISE EXCEPTION 'That playlist is not yours';
  END IF;

  IF NOT public.is_accepted_invitee(v_curator, _user_id) THEN
    RAISE EXCEPTION 'That user has not joined your stream tracker room';
  END IF;

  SELECT COALESCE((SELECT count(*)::bigint FROM public.stream_points sp
                    WHERE sp.curator_playlist_id = _playlist_id
                      AND sp.user_id = _user_id
                      AND sp.played_at >= now() - interval '30 days'), 0)
       + COALESCE((SELECT sum(a.delta)::bigint FROM public.curator_team_point_adjustments a
                    WHERE a.playlist_id = _playlist_id
                      AND a.user_id = _user_id
                      AND a.created_at >= now() - interval '30 days'), 0)
       - COALESCE((SELECT sum(cs.cost_points)::bigint FROM public.curator_submissions cs
                    WHERE cs.submitter_user_id = _user_id
                      AND cs.curator_playlist_id = _playlist_id
                      AND cs.status <> 'rejected'
                      AND cs.created_at >= now() - interval '30 days'), 0)
    INTO v_balance;

  IF v_delta < 0 THEN
    v_delta := GREATEST(v_delta, -GREATEST(v_balance, 0)::integer);
  END IF;

  INSERT INTO public.curator_team_point_adjustments(playlist_id, curator_id, user_id, delta, reason)
  VALUES (_playlist_id, v_curator, _user_id, v_delta, NULLIF(btrim(coalesce(_reason,'')), ''));

  RETURN GREATEST(v_balance + v_delta, 0)::integer;
END;
$function$;

REVOKE ALL ON FUNCTION public.curator_adjust_playlist_points(uuid, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.curator_adjust_playlist_points(uuid, uuid, integer, text) TO authenticated;

-- Count curator-granted points toward what a member can spend on that playlist
CREATE OR REPLACE FUNCTION public.get_playlist_available_points(_playlist_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT GREATEST(
    COALESCE((
      SELECT count(*)
      FROM public.stream_points sp
      WHERE sp.user_id = auth.uid()
        AND sp.curator_playlist_id = _playlist_id
        AND sp.played_at >= now() - interval '30 days'
    ), 0)
    + COALESCE((
      SELECT sum(a.delta)
      FROM public.curator_team_point_adjustments a
      WHERE a.user_id = auth.uid()
        AND a.playlist_id = _playlist_id
        AND a.created_at >= now() - interval '30 days'
    ), 0)
    - COALESCE((
      SELECT SUM(cs.cost_points)
      FROM public.curator_submissions cs
      WHERE cs.submitter_user_id = auth.uid()
        AND cs.curator_playlist_id = _playlist_id
        AND cs.status <> 'rejected'
        AND cs.created_at >= now() - interval '30 days'
    ), 0),
    0
  )::integer;
$function$;

-- Include curator adjustments in the overall stream tracker balance
CREATE OR REPLACE FUNCTION public.get_my_stream_points()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      COALESCE((
        SELECT count(*)::bigint
        FROM public.stream_points sp
        WHERE sp.user_id = auth.uid()
          AND sp.played_at >= now() - interval '30 days'
      ), 0) AS earned,
      COALESCE((
        SELECT sum(cs.cost_points)::bigint
        FROM public.curator_submissions cs
        WHERE cs.submitter_user_id = auth.uid()
          AND cs.status <> 'rejected'
          AND cs.created_at >= now() - interval '30 days'
      ), 0) AS spent,
      COALESCE((
        SELECT sum(a.delta)::bigint
        FROM public.curator_team_point_adjustments a
        WHERE a.user_id = auth.uid()
          AND a.created_at >= now() - interval '30 days'
      ), 0) AS playlist_adjustments
  ), capped_osg_deductions AS (
    SELECT COALESCE(sum(GREATEST(a.adjustment, -a.osg_earned)), 0)::bigint AS total
    FROM (
      SELECT
        cp.curator_id,
        count(sp.id)::bigint AS osg_earned,
        COALESCE((
          SELECT sum(adj.delta)::bigint
          FROM public.osg_point_adjustments adj
          WHERE adj.curator_id = cp.curator_id
            AND adj.user_id = auth.uid()
            AND adj.delta < 0
            AND adj.created_at >= now() - interval '30 days'
        ), 0) AS adjustment
      FROM public.stream_points sp
      JOIN public.curator_playlists cp ON cp.id = sp.curator_playlist_id
      WHERE sp.user_id = auth.uid()
        AND sp.played_at >= now() - interval '30 days'
        AND cp.is_osg = true
      GROUP BY cp.curator_id
    ) a
  )
  SELECT GREATEST(base.earned - base.spent + base.playlist_adjustments + capped_osg_deductions.total, 0)::integer
  FROM base
  CROSS JOIN capped_osg_deductions;
$function$;

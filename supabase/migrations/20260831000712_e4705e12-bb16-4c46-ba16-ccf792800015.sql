-- Clamp curator point removals so a pass never creates a negative (debt) balance
CREATE OR REPLACE FUNCTION public.curator_team_adjust_points(_playlist_id uuid, _user_id uuid, _delta integer, _reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_curator uuid := auth.uid();
  v_balance bigint;
  v_delta integer := _delta;
BEGIN
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _delta = 0 OR abs(_delta) > 100000 THEN RAISE EXCEPTION 'Invalid point amount'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.curator_team_members m
                  WHERE m.playlist_id = _playlist_id AND m.user_id = _user_id AND m.curator_id = v_curator) THEN
    RAISE EXCEPTION 'That user is not in this Team room';
  END IF;

  SELECT COALESCE((SELECT count(*)::bigint FROM public.stream_points sp
                    WHERE sp.curator_playlist_id = _playlist_id AND sp.user_id = _user_id), 0)
       + COALESCE((SELECT sum(a.delta)::bigint FROM public.curator_team_point_adjustments a
                    WHERE a.playlist_id = _playlist_id AND a.user_id = _user_id), 0)
    INTO v_balance;

  IF v_delta < 0 THEN
    v_delta := GREATEST(v_delta, -GREATEST(v_balance, 0)::integer);
    IF v_delta = 0 THEN
      -- Nothing left to remove; record a zero-cost pass without creating debt
      INSERT INTO public.curator_team_point_adjustments(playlist_id, curator_id, user_id, delta, reason)
      VALUES (_playlist_id, v_curator, _user_id, 0, NULLIF(btrim(coalesce(_reason,'')), ''));
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.curator_team_point_adjustments(playlist_id, curator_id, user_id, delta, reason)
  VALUES (_playlist_id, v_curator, _user_id, v_delta, NULLIF(btrim(coalesce(_reason,'')), ''));
END; $function$;

-- Clear existing negative balances created by earlier passes
INSERT INTO public.curator_team_point_adjustments (playlist_id, curator_id, user_id, delta, reason)
SELECT b.playlist_id, b.curator_id, b.user_id, (-b.balance)::integer, 'Pass debt cleared'
FROM (
  SELECT m.playlist_id,
         cp.curator_id,
         m.user_id,
         COALESCE((SELECT count(*)::bigint FROM public.stream_points sp
                    WHERE sp.curator_playlist_id = m.playlist_id AND sp.user_id = m.user_id), 0)
         + COALESCE((SELECT sum(a.delta)::bigint FROM public.curator_team_point_adjustments a
                      WHERE a.playlist_id = m.playlist_id AND a.user_id = m.user_id), 0) AS balance
  FROM public.curator_team_members m
  JOIN public.curator_playlists cp ON cp.id = m.playlist_id
) b
WHERE b.balance < 0;
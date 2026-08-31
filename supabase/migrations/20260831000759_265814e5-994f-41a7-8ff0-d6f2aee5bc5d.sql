CREATE OR REPLACE FUNCTION public.osg_adjust_points(_user_id uuid, _delta integer, _reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _balance bigint;
  _d integer := _delta;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _delta >= 0 THEN
    RAISE EXCEPTION 'This action can only remove points';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.osg_artist_picks
    WHERE user_id = auth.uid()
      AND artist_id = _user_id
  ) THEN
    RAISE EXCEPTION 'That user is not on your OSG Artists list';
  END IF;

  SELECT COALESCE((
      SELECT count(*)::bigint
      FROM public.stream_points sp
      JOIN public.curator_playlists cpl ON cpl.id = sp.curator_playlist_id
      WHERE cpl.curator_id = auth.uid() AND cpl.is_osg = true AND sp.user_id = _user_id
    ), 0)
    + COALESCE((
      SELECT sum(adj.delta)::bigint
      FROM public.osg_point_adjustments adj
      WHERE adj.curator_id = auth.uid() AND adj.user_id = _user_id
    ), 0)
  INTO _balance;

  -- Never remove more than the member currently has: a pass must not create debt
  _d := GREATEST(_d, -GREATEST(_balance, 0)::integer);

  INSERT INTO public.osg_point_adjustments (curator_id, user_id, delta, reason)
  VALUES (auth.uid(), _user_id, _d, _reason)
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

-- Clear leftover negative balances from earlier passes
INSERT INTO public.osg_point_adjustments (curator_id, user_id, delta, reason)
SELECT b.curator_id, b.artist_id, (-b.balance)::integer, 'Pass debt cleared'
FROM (
  SELECT DISTINCT pk.user_id AS curator_id, pk.artist_id,
    COALESCE((
      SELECT count(*)::bigint FROM public.stream_points sp
      JOIN public.curator_playlists cpl ON cpl.id = sp.curator_playlist_id
      WHERE cpl.curator_id = pk.user_id AND cpl.is_osg = true AND sp.user_id = pk.artist_id
    ), 0)
    + COALESCE((
      SELECT sum(adj.delta)::bigint FROM public.osg_point_adjustments adj
      WHERE adj.curator_id = pk.user_id AND adj.user_id = pk.artist_id
    ), 0) AS balance
  FROM public.osg_artist_picks pk
) b
WHERE b.balance < 0;
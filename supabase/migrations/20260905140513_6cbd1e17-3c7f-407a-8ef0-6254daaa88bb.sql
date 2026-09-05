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

  IF _delta = 0 THEN
    RAISE EXCEPTION 'Enter a number of points';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.osg_artist_picks
    WHERE user_id = auth.uid()
      AND artist_id = _user_id
  ) THEN
    RAISE EXCEPTION 'That user is not on your OSG Artists list';
  END IF;

  IF _delta < 0 THEN
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

    _d := GREATEST(_d, -GREATEST(_balance, 0)::integer);
  END IF;

  INSERT INTO public.osg_point_adjustments (curator_id, user_id, delta, reason)
  VALUES (auth.uid(), _user_id, _d, _reason)
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

REVOKE ALL ON FUNCTION public.osg_adjust_points(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.osg_adjust_points(uuid, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.osg_adjust_points(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.osg_adjust_points(uuid, integer, text) TO service_role;
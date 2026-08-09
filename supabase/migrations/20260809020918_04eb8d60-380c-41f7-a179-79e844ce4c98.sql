CREATE OR REPLACE FUNCTION public.list_my_osg_artist_picks()
RETURNS TABLE(
  id uuid,
  artist_id uuid,
  username text,
  avatar_url text,
  account_type public.account_type,
  weekly_points bigint,
  weekly_min integer,
  created_at timestamptz,
  last_deduction_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.artist_id,
    pr.username,
    pr.avatar_url,
    pr.account_type,
    GREATEST(
      0,
      COALESCE((
        SELECT count(*)::bigint
        FROM public.stream_points sp
        JOIN public.curator_playlists cp ON cp.id = sp.curator_playlist_id
        WHERE cp.curator_id = auth.uid()
          AND cp.is_osg = true
          AND sp.user_id = p.artist_id
      ), 0)
      + COALESCE((
        SELECT sum(adj.delta)::bigint
        FROM public.osg_point_adjustments adj
        WHERE adj.curator_id = auth.uid()
          AND adj.user_id = p.artist_id
      ), 0)
    ) AS weekly_points,
    COALESCE(cpr.osg_weekly_min, 600) AS weekly_min,
    p.created_at,
    (
      SELECT max(adj.created_at)
      FROM public.osg_point_adjustments adj
      WHERE adj.curator_id = auth.uid()
        AND adj.user_id = p.artist_id
        AND adj.delta < 0
    ) AS last_deduction_at
  FROM public.osg_artist_picks p
  JOIN public.profiles pr ON pr.id = p.artist_id
  LEFT JOIN public.profiles cpr ON cpr.id = auth.uid()
  WHERE p.user_id = auth.uid()
  ORDER BY pr.username;
$$;

CREATE OR REPLACE FUNCTION public.list_my_osg_rosters()
RETURNS TABLE(
  curator_id uuid,
  curator_username text,
  curator_avatar_url text,
  artist_id uuid,
  username text,
  avatar_url text,
  account_type public.account_type,
  weekly_points bigint,
  weekly_min integer,
  is_me boolean,
  last_deduction_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_curators AS (
    SELECT DISTINCT p.user_id AS curator_id
    FROM public.osg_artist_picks p
    WHERE p.artist_id = auth.uid()
  )
  SELECT
    mc.curator_id,
    cp.username,
    cp.avatar_url,
    p.artist_id,
    pr.username,
    pr.avatar_url,
    pr.account_type,
    GREATEST(
      0,
      COALESCE((
        SELECT count(*)::bigint
        FROM public.stream_points sp
        JOIN public.curator_playlists cpl ON cpl.id = sp.curator_playlist_id
        WHERE cpl.curator_id = mc.curator_id
          AND cpl.is_osg = true
          AND sp.user_id = p.artist_id
      ), 0)
      + COALESCE((
        SELECT sum(adj.delta)::bigint
        FROM public.osg_point_adjustments adj
        WHERE adj.curator_id = mc.curator_id
          AND adj.user_id = p.artist_id
      ), 0)
    ) AS weekly_points,
    COALESCE(cp.osg_weekly_min, 600) AS weekly_min,
    (p.artist_id = auth.uid()) AS is_me,
    (
      SELECT max(adj.created_at)
      FROM public.osg_point_adjustments adj
      WHERE adj.curator_id = mc.curator_id
        AND adj.user_id = p.artist_id
        AND adj.delta < 0
    ) AS last_deduction_at
  FROM my_curators mc
  JOIN public.osg_artist_picks p ON p.user_id = mc.curator_id
  JOIN public.profiles pr ON pr.id = p.artist_id
  JOIN public.profiles cp ON cp.id = mc.curator_id
  ORDER BY cp.username, pr.username;
$$;

CREATE OR REPLACE FUNCTION public.osg_adjust_points(
  _user_id uuid,
  _delta integer,
  _reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
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

  INSERT INTO public.osg_point_adjustments (curator_id, user_id, delta, reason)
  VALUES (auth.uid(), _user_id, _delta, _reason)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.osg_adjust_points(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.osg_adjust_points(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.osg_adjust_points(uuid, integer, text) TO service_role;
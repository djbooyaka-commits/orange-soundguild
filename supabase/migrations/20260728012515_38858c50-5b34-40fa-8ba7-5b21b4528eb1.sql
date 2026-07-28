
-- 1. Weekly min column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS osg_weekly_min integer NOT NULL DEFAULT 600;

-- 2. Adjustments table
CREATE TABLE IF NOT EXISTS public.osg_point_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS osg_point_adj_curator_user_idx
  ON public.osg_point_adjustments (curator_id, user_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.osg_point_adjustments TO authenticated;
GRANT ALL ON public.osg_point_adjustments TO service_role;
ALTER TABLE public.osg_point_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "curator manages own adjustments"
  ON public.osg_point_adjustments
  FOR ALL
  TO authenticated
  USING (auth.uid() = curator_id)
  WITH CHECK (auth.uid() = curator_id);

CREATE POLICY "affected user can see own adjustments"
  ON public.osg_point_adjustments
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Rewrite RPCs to include adjustments + weekly_min

DROP FUNCTION IF EXISTS public.list_my_osg_artist_picks();
DROP FUNCTION IF EXISTS public.list_my_osg_rosters();

CREATE OR REPLACE FUNCTION public.list_my_osg_artist_picks()
RETURNS TABLE(
  id uuid, artist_id uuid, username text, avatar_url text,
  account_type account_type, weekly_points bigint, weekly_min integer,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.id, p.artist_id, pr.username, pr.avatar_url, pr.account_type,
    GREATEST(0,
      COALESCE((
        SELECT count(*)::bigint
        FROM public.stream_points sp
        JOIN public.curator_playlists cp ON cp.id = sp.curator_playlist_id
        WHERE cp.curator_id = auth.uid()
          AND cp.is_osg = true
          AND sp.user_id = p.artist_id
          AND sp.created_at > now() - interval '7 days'
      ), 0)
      + COALESCE((
        SELECT sum(delta)::bigint
        FROM public.osg_point_adjustments adj
        WHERE adj.curator_id = auth.uid()
          AND adj.user_id = p.artist_id
          AND adj.created_at > now() - interval '7 days'
      ), 0)
    ) AS weekly_points,
    COALESCE(cpr.osg_weekly_min, 600) AS weekly_min,
    p.created_at
  FROM public.osg_artist_picks p
  JOIN public.profiles pr ON pr.id = p.artist_id
  LEFT JOIN public.profiles cpr ON cpr.id = auth.uid()
  WHERE p.user_id = auth.uid()
  ORDER BY pr.username;
$$;

CREATE OR REPLACE FUNCTION public.list_my_osg_rosters()
RETURNS TABLE(
  curator_id uuid, curator_username text, curator_avatar_url text,
  artist_id uuid, username text, avatar_url text, account_type account_type,
  weekly_points bigint, weekly_min integer, is_me boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH my_curators AS (
    SELECT DISTINCT p.user_id AS curator_id
    FROM public.osg_artist_picks p
    WHERE p.artist_id = auth.uid()
  )
  SELECT
    mc.curator_id, cp.username, cp.avatar_url,
    p.artist_id, pr.username, pr.avatar_url, pr.account_type,
    GREATEST(0,
      COALESCE((
        SELECT count(*)::bigint
        FROM public.stream_points sp
        JOIN public.curator_playlists cpl ON cpl.id = sp.curator_playlist_id
        WHERE cpl.curator_id = mc.curator_id
          AND cpl.is_osg = true
          AND sp.user_id = p.artist_id
          AND sp.created_at > now() - interval '7 days'
      ), 0)
      + COALESCE((
        SELECT sum(delta)::bigint
        FROM public.osg_point_adjustments adj
        WHERE adj.curator_id = mc.curator_id
          AND adj.user_id = p.artist_id
          AND adj.created_at > now() - interval '7 days'
      ), 0)
    ) AS weekly_points,
    COALESCE(cp.osg_weekly_min, 600) AS weekly_min,
    (p.artist_id = auth.uid()) AS is_me
  FROM my_curators mc
  JOIN public.osg_artist_picks p ON p.user_id = mc.curator_id
  JOIN public.profiles pr ON pr.id = p.artist_id
  JOIN public.profiles cp ON cp.id = mc.curator_id
  ORDER BY cp.username, pr.username;
$$;

-- 4. Helper RPCs

CREATE OR REPLACE FUNCTION public.osg_adjust_points(_user_id uuid, _delta integer, _reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF _delta = 0 THEN
    RAISE EXCEPTION 'Delta cannot be zero';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.osg_artist_picks
    WHERE user_id = auth.uid() AND artist_id = _user_id
  ) THEN
    RAISE EXCEPTION 'That user is not on your OSG Artists list';
  END IF;
  INSERT INTO public.osg_point_adjustments (curator_id, user_id, delta, reason)
  VALUES (auth.uid(), _user_id, _delta, _reason)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.osg_set_weekly_min(_min integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _min IS NULL OR _min < 0 OR _min > 100000 THEN
    RAISE EXCEPTION 'Minimum must be between 0 and 100000';
  END IF;
  UPDATE public.profiles SET osg_weekly_min = _min WHERE id = auth.uid();
  RETURN _min;
END;
$$;

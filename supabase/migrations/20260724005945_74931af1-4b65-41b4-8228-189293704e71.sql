
DROP FUNCTION IF EXISTS public.list_my_osg_artist_picks();

CREATE OR REPLACE FUNCTION public.add_osg_artist_pick(_username text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_target uuid;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO v_target FROM public.profiles
  WHERE lower(username) = lower(btrim(_username)) LIMIT 1;
  IF v_target IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_target = v_user THEN RAISE EXCEPTION 'You cannot add yourself'; END IF;
  IF NOT public.is_accepted_invitee(v_user, v_target) THEN
    RAISE EXCEPTION 'That user has not accepted your Curator invite yet';
  END IF;
  INSERT INTO public.osg_artist_picks(user_id, artist_id)
  VALUES (v_user, v_target)
  ON CONFLICT (user_id, artist_id) DO UPDATE SET created_at = osg_artist_picks.created_at
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.list_my_osg_artist_picks()
RETURNS TABLE(
  id uuid,
  artist_id uuid,
  username text,
  avatar_url text,
  account_type public.account_type,
  weekly_points bigint,
  created_at timestamptz
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
    COALESCE((
      SELECT count(*)::bigint
      FROM public.stream_points sp
      JOIN public.curator_playlists cp ON cp.id = sp.curator_playlist_id
      WHERE cp.curator_id = auth.uid()
        AND sp.user_id = p.artist_id
        AND sp.created_at > now() - interval '7 days'
    ), 0) AS weekly_points,
    p.created_at
  FROM public.osg_artist_picks p
  JOIN public.profiles pr ON pr.id = p.artist_id
  WHERE p.user_id = auth.uid()
  ORDER BY pr.username;
$$;

CREATE OR REPLACE FUNCTION public.can_use_osg_artists()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.osg_artist_picks WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.osg_artist_picks WHERE artist_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.curator_invites
      WHERE curator_id = auth.uid() AND status = 'accepted'
    )
  );
$$;

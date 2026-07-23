
CREATE TABLE public.osg_artist_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, artist_id)
);

GRANT SELECT, INSERT, DELETE ON public.osg_artist_picks TO authenticated;
GRANT ALL ON public.osg_artist_picks TO service_role;

ALTER TABLE public.osg_artist_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own picks"
ON public.osg_artist_picks
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.add_osg_artist_pick(_username text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_target uuid;
  v_type public.account_type;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id, account_type INTO v_target, v_type
  FROM public.profiles
  WHERE lower(username) = lower(btrim(_username))
  LIMIT 1;
  IF v_target IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_type NOT IN ('artist','pioneer') THEN
    RAISE EXCEPTION 'That user is not an Artist or Pioneer';
  END IF;
  INSERT INTO public.osg_artist_picks(user_id, artist_id)
  VALUES (v_user, v_target)
  ON CONFLICT (user_id, artist_id) DO UPDATE SET created_at = osg_artist_picks.created_at
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_osg_artist_picks()
RETURNS TABLE(id uuid, artist_id uuid, username text, avatar_url text, account_type public.account_type, created_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.artist_id, pr.username, pr.avatar_url, pr.account_type, p.created_at
  FROM public.osg_artist_picks p
  JOIN public.profiles pr ON pr.id = p.artist_id
  WHERE p.user_id = auth.uid()
  ORDER BY pr.username;
$$;

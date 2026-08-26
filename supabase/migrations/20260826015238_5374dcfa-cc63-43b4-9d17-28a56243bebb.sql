ALTER TABLE public.curator_playlists
  ADD COLUMN IF NOT EXISTS is_team boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS team_weekly_min integer NOT NULL DEFAULT 300;

CREATE TABLE IF NOT EXISTS public.curator_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.curator_playlists(id) ON DELETE CASCADE,
  curator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, user_id)
);
GRANT SELECT ON public.curator_team_members TO authenticated;
GRANT ALL ON public.curator_team_members TO service_role;
ALTER TABLE public.curator_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Curator or member can view team members"
  ON public.curator_team_members FOR SELECT TO authenticated
  USING (
    curator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.curator_team_members m2
      WHERE m2.playlist_id = curator_team_members.playlist_id AND m2.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.curator_team_member_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.curator_playlists(id) ON DELETE CASCADE,
  curator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spotify_artist_url text,
  spotify_artist_name text,
  track_urls text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, user_id)
);
GRANT SELECT ON public.curator_team_member_links TO authenticated;
GRANT ALL ON public.curator_team_member_links TO service_role;
ALTER TABLE public.curator_team_member_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Curator or member can view team links"
  ON public.curator_team_member_links FOR SELECT TO authenticated
  USING (
    curator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.curator_team_members m2
      WHERE m2.playlist_id = curator_team_member_links.playlist_id AND m2.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.curator_team_point_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.curator_playlists(id) ON DELETE CASCADE,
  curator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.curator_team_point_adjustments TO authenticated;
GRANT ALL ON public.curator_team_point_adjustments TO service_role;
ALTER TABLE public.curator_team_point_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Curator or subject can view team adjustments"
  ON public.curator_team_point_adjustments FOR SELECT TO authenticated
  USING (curator_id = auth.uid() OR user_id = auth.uid());

CREATE TRIGGER curator_team_members_updated_at BEFORE UPDATE ON public.curator_team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER curator_team_member_links_updated_at BEFORE UPDATE ON public.curator_team_member_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mark / unmark a playlist as a Team playlist
CREATE OR REPLACE FUNCTION public.set_curator_playlist_is_team(_playlist_id uuid, _is_team boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.curator_playlists SET is_team = _is_team
   WHERE id = _playlist_id AND curator_id = auth.uid();
END; $$;

CREATE OR REPLACE FUNCTION public.curator_team_set_weekly_min(_playlist_id uuid, _min integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _min < 0 OR _min > 1000000 THEN RAISE EXCEPTION 'Invalid minimum'; END IF;
  UPDATE public.curator_playlists SET team_weekly_min = _min
   WHERE id = _playlist_id AND curator_id = auth.uid();
END; $$;

-- Rooms visible to me (as curator, or as a member)
CREATE OR REPLACE FUNCTION public.list_my_curator_team_rooms()
RETURNS TABLE (
  playlist_id uuid,
  curator_id uuid,
  curator_username text,
  name text,
  image_url text,
  spotify_playlist_id text,
  team_weekly_min integer,
  is_owner boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cp.id, cp.curator_id, pr.username, cp.name, cp.image_url, cp.spotify_playlist_id,
         cp.team_weekly_min, (cp.curator_id = auth.uid())
  FROM public.curator_playlists cp
  LEFT JOIN public.profiles pr ON pr.id = cp.curator_id
  WHERE cp.is_team = true
    AND auth.uid() IS NOT NULL
    AND (
      cp.curator_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.curator_team_members m WHERE m.playlist_id = cp.id AND m.user_id = auth.uid())
    )
  ORDER BY cp.created_at;
$$;

-- Roster of one team room, with points from that playlist only
CREATE OR REPLACE FUNCTION public.curator_team_roster(_playlist_id uuid)
RETURNS TABLE (
  member_id uuid,
  user_id uuid,
  username text,
  avatar_url text,
  account_type public.account_type,
  points bigint,
  weekly_min integer,
  is_me boolean,
  last_deduction_at timestamptz,
  spotify_artist_url text,
  spotify_artist_name text,
  track_urls text[]
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.user_id, pr.username, pr.avatar_url, pr.account_type,
    GREATEST(0,
      COALESCE((SELECT count(*)::bigint FROM public.stream_points sp
                 WHERE sp.curator_playlist_id = _playlist_id AND sp.user_id = m.user_id), 0)
      + COALESCE((SELECT sum(a.delta)::bigint FROM public.curator_team_point_adjustments a
                   WHERE a.playlist_id = _playlist_id AND a.user_id = m.user_id), 0)
    ) AS points,
    cp.team_weekly_min,
    (m.user_id = auth.uid()),
    (SELECT max(a.created_at) FROM public.curator_team_point_adjustments a
      WHERE a.playlist_id = _playlist_id AND a.user_id = m.user_id AND a.delta < 0),
    l.spotify_artist_url, l.spotify_artist_name, l.track_urls
  FROM public.curator_team_members m
  JOIN public.curator_playlists cp ON cp.id = m.playlist_id
  LEFT JOIN public.profiles pr ON pr.id = m.user_id
  LEFT JOIN public.curator_team_member_links l ON l.playlist_id = m.playlist_id AND l.user_id = m.user_id
  WHERE m.playlist_id = _playlist_id
    AND auth.uid() IS NOT NULL
    AND (cp.curator_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.curator_team_members m2 WHERE m2.playlist_id = _playlist_id AND m2.user_id = auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.curator_team_add_member(_playlist_id uuid, _username text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_curator uuid := auth.uid(); v_target uuid; v_id uuid;
BEGIN
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.curator_playlists WHERE id = _playlist_id AND curator_id = v_curator AND is_team = true) THEN
    RAISE EXCEPTION 'Not your Team playlist';
  END IF;
  SELECT id INTO v_target FROM public.profiles WHERE lower(username) = lower(btrim(_username)) LIMIT 1;
  IF v_target IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_target = v_curator THEN RAISE EXCEPTION 'You cannot add yourself'; END IF;
  IF NOT public.is_accepted_invitee(v_curator, v_target) THEN
    RAISE EXCEPTION 'That user has not accepted your Curator invite yet';
  END IF;
  INSERT INTO public.curator_team_members(playlist_id, curator_id, user_id)
  VALUES (_playlist_id, v_curator, v_target)
  ON CONFLICT (playlist_id, user_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.curator_team_remove_member(_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_playlist uuid; v_user uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT playlist_id, user_id INTO v_playlist, v_user FROM public.curator_team_members
   WHERE id = _member_id AND curator_id = auth.uid();
  IF v_playlist IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  DELETE FROM public.curator_team_members WHERE id = _member_id;
  DELETE FROM public.curator_team_member_links WHERE playlist_id = v_playlist AND user_id = v_user;
END; $$;

CREATE OR REPLACE FUNCTION public.curator_team_set_links(
  _playlist_id uuid, _user_id uuid, _artist_url text, _artist_name text, _urls text[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_curator uuid := auth.uid(); v_clean text[]; v_artist text := NULLIF(btrim(coalesce(_artist_url,'')), '');
BEGIN
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.curator_team_members m
                  WHERE m.playlist_id = _playlist_id AND m.user_id = _user_id AND m.curator_id = v_curator) THEN
    RAISE EXCEPTION 'That user is not in this Team room';
  END IF;
  IF v_artist IS NOT NULL AND v_artist !~ '^https://open\.spotify\.com/artist/[A-Za-z0-9]+' THEN
    RAISE EXCEPTION 'Invalid Spotify artist URL';
  END IF;
  SELECT coalesce(array_agg(u ORDER BY ord), '{}'::text[]) INTO v_clean
  FROM (SELECT btrim(u) AS u, ord FROM unnest(coalesce(_urls,'{}'::text[])) WITH ORDINALITY AS t(u, ord)) s
  WHERE s.u <> '' AND s.u ~ '^https?://' AND length(s.u) <= 500;
  IF array_length(v_clean, 1) > 5 THEN v_clean := v_clean[1:5]; END IF;

  INSERT INTO public.curator_team_member_links(playlist_id, curator_id, user_id, spotify_artist_url, spotify_artist_name, track_urls)
  VALUES (_playlist_id, v_curator, _user_id, v_artist, NULLIF(btrim(coalesce(_artist_name,'')), ''), v_clean)
  ON CONFLICT (playlist_id, user_id) DO UPDATE
    SET spotify_artist_url = EXCLUDED.spotify_artist_url,
        spotify_artist_name = EXCLUDED.spotify_artist_name,
        track_urls = EXCLUDED.track_urls,
        updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.curator_team_adjust_points(
  _playlist_id uuid, _user_id uuid, _delta integer, _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_curator uuid := auth.uid();
BEGIN
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _delta = 0 OR abs(_delta) > 100000 THEN RAISE EXCEPTION 'Invalid point amount'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.curator_team_members m
                  WHERE m.playlist_id = _playlist_id AND m.user_id = _user_id AND m.curator_id = v_curator) THEN
    RAISE EXCEPTION 'That user is not in this Team room';
  END IF;
  INSERT INTO public.curator_team_point_adjustments(playlist_id, curator_id, user_id, delta, reason)
  VALUES (_playlist_id, v_curator, _user_id, _delta, NULLIF(btrim(coalesce(_reason,'')), ''));
END; $$;

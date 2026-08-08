-- ============ BETA STREAM TRACKER (isolated sandbox) ============

CREATE TABLE public.beta_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_rooms TO authenticated;
GRANT ALL ON public.beta_rooms TO service_role;
ALTER TABLE public.beta_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "beta_rooms_select" ON public.beta_rooms
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "beta_rooms_insert_own" ON public.beta_rooms
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "beta_rooms_update_own" ON public.beta_rooms
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "beta_rooms_delete_own" ON public.beta_rooms
  FOR DELETE TO authenticated USING (owner_id = auth.uid());


CREATE TABLE public.beta_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.beta_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  last_polled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_room_members TO authenticated;
GRANT ALL ON public.beta_room_members TO service_role;
ALTER TABLE public.beta_room_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_beta_room_owner(_room uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.beta_rooms r WHERE r.id = _room AND r.owner_id = _user)
$$;

CREATE OR REPLACE FUNCTION public.is_beta_room_member(_room uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.beta_room_members m WHERE m.room_id = _room AND m.user_id = _user
  ) OR public.is_beta_room_owner(_room, _user)
$$;

CREATE POLICY "beta_members_select" ON public.beta_room_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_beta_room_owner(room_id, auth.uid()));
CREATE POLICY "beta_members_join_self" ON public.beta_room_members
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "beta_members_leave" ON public.beta_room_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_beta_room_owner(room_id, auth.uid()));


CREATE TABLE public.beta_room_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.beta_rooms(id) ON DELETE CASCADE,
  spotify_track_id text NOT NULL,
  track_name text,
  artist_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, spotify_track_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_room_tracks TO authenticated;
GRANT ALL ON public.beta_room_tracks TO service_role;
ALTER TABLE public.beta_room_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "beta_tracks_select_members" ON public.beta_room_tracks
  FOR SELECT TO authenticated USING (public.is_beta_room_member(room_id, auth.uid()));
CREATE POLICY "beta_tracks_owner_write" ON public.beta_room_tracks
  FOR ALL TO authenticated
  USING (public.is_beta_room_owner(room_id, auth.uid()))
  WITH CHECK (public.is_beta_room_owner(room_id, auth.uid()));


CREATE TABLE public.beta_stream_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.beta_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  spotify_track_id text NOT NULL,
  spotify_track_name text,
  played_at timestamptz NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id, spotify_track_id, played_at)
);

-- Read-only for users; only the server (service_role) writes points.
GRANT SELECT ON public.beta_stream_points TO authenticated;
GRANT ALL ON public.beta_stream_points TO service_role;
ALTER TABLE public.beta_stream_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "beta_points_select" ON public.beta_stream_points
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_beta_room_owner(room_id, auth.uid()));


CREATE OR REPLACE FUNCTION public.beta_room_leaderboard(_room uuid)
RETURNS TABLE (user_id uuid, username text, points bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id, pr.username, count(*)::bigint AS points
  FROM public.beta_stream_points p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.room_id = _room
    AND (public.is_beta_room_member(_room, auth.uid()))
  GROUP BY p.user_id, pr.username
  ORDER BY points DESC
$$;

CREATE OR REPLACE FUNCTION public.beta_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER beta_rooms_touch BEFORE UPDATE ON public.beta_rooms
  FOR EACH ROW EXECUTE FUNCTION public.beta_touch_updated_at();
CREATE TRIGGER beta_members_touch BEFORE UPDATE ON public.beta_room_members
  FOR EACH ROW EXECUTE FUNCTION public.beta_touch_updated_at();
CREATE TRIGGER beta_tracks_touch BEFORE UPDATE ON public.beta_room_tracks
  FOR EACH ROW EXECUTE FUNCTION public.beta_touch_updated_at();
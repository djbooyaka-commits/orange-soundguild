-- Room playlists
CREATE TABLE public.beta_room_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.beta_rooms(id) ON DELETE CASCADE,
  spotify_playlist_id text NOT NULL,
  name text NOT NULL,
  image_url text,
  track_hold_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, spotify_playlist_id)
);

GRANT SELECT ON public.beta_room_playlists TO authenticated;
GRANT ALL ON public.beta_room_playlists TO service_role;
ALTER TABLE public.beta_room_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Room members can view playlists"
ON public.beta_room_playlists FOR SELECT TO authenticated
USING (public.is_beta_room_owner(room_id, auth.uid()) OR public.is_beta_room_member(room_id, auth.uid()));

CREATE TRIGGER beta_room_playlists_updated_at
BEFORE UPDATE ON public.beta_room_playlists
FOR EACH ROW EXECUTE FUNCTION public.beta_touch_updated_at();

-- Tracked tracks can belong to a playlist
ALTER TABLE public.beta_room_tracks
  ADD COLUMN playlist_id uuid REFERENCES public.beta_room_playlists(id) ON DELETE CASCADE;

-- Invite code per room
ALTER TABLE public.beta_rooms
  ADD COLUMN invite_code text;

UPDATE public.beta_rooms SET invite_code = encode(gen_random_bytes(6), 'hex') WHERE invite_code IS NULL;

ALTER TABLE public.beta_rooms ALTER COLUMN invite_code SET DEFAULT encode(gen_random_bytes(6), 'hex');
ALTER TABLE public.beta_rooms ALTER COLUMN invite_code SET NOT NULL;
CREATE UNIQUE INDEX beta_rooms_invite_code_key ON public.beta_rooms(invite_code);

-- Track submissions inside a room
CREATE TABLE public.beta_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.beta_rooms(id) ON DELETE CASCADE,
  playlist_id uuid NOT NULL REFERENCES public.beta_room_playlists(id) ON DELETE CASCADE,
  submitter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spotify_track_id text NOT NULL,
  spotify_track_url text NOT NULL,
  spotify_track_name text,
  cost_points integer NOT NULL DEFAULT 50,
  status public.curator_submission_status NOT NULL DEFAULT 'pending',
  curator_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

GRANT SELECT ON public.beta_submissions TO authenticated;
GRANT ALL ON public.beta_submissions TO service_role;
ALTER TABLE public.beta_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Submitters can view their own submissions"
ON public.beta_submissions FOR SELECT TO authenticated
USING (auth.uid() = submitter_user_id);

CREATE POLICY "Room owners can view submissions"
ON public.beta_submissions FOR SELECT TO authenticated
USING (auth.uid() = owner_id);

CREATE INDEX beta_submissions_room_idx ON public.beta_submissions(room_id, created_at DESC);
CREATE INDEX beta_room_tracks_playlist_idx ON public.beta_room_tracks(playlist_id);
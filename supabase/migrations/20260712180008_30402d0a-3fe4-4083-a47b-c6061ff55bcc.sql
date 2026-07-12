
-- Status enum
DO $$ BEGIN
  CREATE TYPE public.curator_submission_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.curator_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_playlist_id uuid NOT NULL REFERENCES public.curator_playlists(id) ON DELETE CASCADE,
  submitter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  curator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spotify_track_id text NOT NULL,
  spotify_track_url text NOT NULL,
  spotify_track_name text,
  cost_points integer NOT NULL,
  followed_all_artists boolean NOT NULL DEFAULT false,
  status public.curator_submission_status NOT NULL DEFAULT 'pending',
  curator_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX curator_submissions_curator_idx ON public.curator_submissions(curator_id, status, created_at DESC);
CREATE INDEX curator_submissions_submitter_idx ON public.curator_submissions(submitter_user_id, created_at DESC);
CREATE INDEX curator_submissions_playlist_idx ON public.curator_submissions(curator_playlist_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.curator_submissions TO authenticated;
GRANT ALL ON public.curator_submissions TO service_role;

ALTER TABLE public.curator_submissions ENABLE ROW LEVEL SECURITY;

-- Submitter can read own
CREATE POLICY "Submitter reads own submissions"
ON public.curator_submissions FOR SELECT
TO authenticated
USING (submitter_user_id = auth.uid());

-- Curator can read submissions to their playlists
CREATE POLICY "Curator reads submissions to their playlists"
ON public.curator_submissions FOR SELECT
TO authenticated
USING (curator_id = auth.uid());

-- Admins full read
CREATE POLICY "Admins read all submissions"
ON public.curator_submissions FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Inserts/updates go through SECURITY DEFINER RPCs only; no direct write policies.

-- Available points on a playlist for a user = earned - spent
CREATE OR REPLACE FUNCTION public.get_playlist_available_points(_playlist_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    (
      SELECT COALESCE(count(*), 0)::integer
      FROM public.stream_points
      WHERE user_id = auth.uid() AND curator_playlist_id = _playlist_id
    )
    -
    (
      SELECT COALESCE(SUM(cost_points), 0)::integer
      FROM public.curator_submissions
      WHERE submitter_user_id = auth.uid()
        AND curator_playlist_id = _playlist_id
        AND status <> 'rejected'
    ),
    0
  );
$$;

-- Submit a track link (called by server function after Spotify follow check)
CREATE OR REPLACE FUNCTION public.submit_curator_track(
  _playlist_id uuid,
  _spotify_track_id text,
  _spotify_track_url text,
  _spotify_track_name text,
  _followed_all boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_curator uuid;
  v_cost int;
  v_avail int;
  v_recent int;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _spotify_track_id IS NULL OR length(btrim(_spotify_track_id)) = 0 THEN
    RAISE EXCEPTION 'Missing track id';
  END IF;

  SELECT curator_id INTO v_curator
  FROM public.curator_playlists
  WHERE id = _playlist_id;
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Playlist not found'; END IF;
  IF v_curator = v_user THEN RAISE EXCEPTION 'You cannot submit to your own playlist'; END IF;

  -- Must be an accepted invitee of this curator
  IF NOT public.is_accepted_invitee(v_curator, v_user) THEN
    RAISE EXCEPTION 'You are not enrolled with this curator';
  END IF;

  -- Rate limit: at most 2 submissions in any rolling 24h window
  SELECT count(*) INTO v_recent
  FROM public.curator_submissions
  WHERE submitter_user_id = v_user
    AND created_at > now() - interval '24 hours';
  IF v_recent >= 2 THEN
    RAISE EXCEPTION 'Limit reached: you can submit at most 2 tracks every 24 hours';
  END IF;

  v_cost := CASE WHEN _followed_all THEN 45 ELSE 50 END;

  v_avail := public.get_playlist_available_points(_playlist_id);
  IF v_avail < v_cost THEN
    RAISE EXCEPTION 'Not enough points on this playlist (need %, have %)', v_cost, v_avail;
  END IF;

  INSERT INTO public.curator_submissions (
    curator_playlist_id, submitter_user_id, curator_id,
    spotify_track_id, spotify_track_url, spotify_track_name,
    cost_points, followed_all_artists
  )
  VALUES (
    _playlist_id, v_user, v_curator,
    _spotify_track_id, _spotify_track_url, _spotify_track_name,
    v_cost, _followed_all
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Curator reviews a submission
CREATE OR REPLACE FUNCTION public.review_curator_submission(
  _submission_id uuid,
  _approve boolean,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row public.curator_submissions%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.curator_submissions WHERE id = _submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found'; END IF;
  IF v_row.curator_id <> v_user THEN RAISE EXCEPTION 'Not your submission to review'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'Already reviewed'; END IF;

  UPDATE public.curator_submissions
  SET status = CASE WHEN _approve THEN 'approved'::public.curator_submission_status
                    ELSE 'rejected'::public.curator_submission_status END,
      curator_note = _note,
      reviewed_at = now()
  WHERE id = _submission_id;
END;
$$;

-- Lists for curator + submitter
CREATE OR REPLACE FUNCTION public.list_curator_submissions_for_me()
RETURNS TABLE(
  id uuid, curator_playlist_id uuid, playlist_name text,
  submitter_user_id uuid, submitter_username text,
  spotify_track_id text, spotify_track_url text, spotify_track_name text,
  cost_points int, followed_all_artists boolean,
  status public.curator_submission_status, curator_note text,
  created_at timestamptz, reviewed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.curator_playlist_id, cp.name,
         s.submitter_user_id, p.username,
         s.spotify_track_id, s.spotify_track_url, s.spotify_track_name,
         s.cost_points, s.followed_all_artists,
         s.status, s.curator_note, s.created_at, s.reviewed_at
  FROM public.curator_submissions s
  JOIN public.curator_playlists cp ON cp.id = s.curator_playlist_id
  JOIN public.profiles p ON p.id = s.submitter_user_id
  WHERE s.curator_id = auth.uid()
  ORDER BY s.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_my_track_submissions()
RETURNS TABLE(
  id uuid, curator_playlist_id uuid, playlist_name text,
  spotify_track_id text, spotify_track_url text, spotify_track_name text,
  cost_points int, followed_all_artists boolean,
  status public.curator_submission_status, curator_note text,
  created_at timestamptz, reviewed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.curator_playlist_id, cp.name,
         s.spotify_track_id, s.spotify_track_url, s.spotify_track_name,
         s.cost_points, s.followed_all_artists,
         s.status, s.curator_note, s.created_at, s.reviewed_at
  FROM public.curator_submissions s
  JOIN public.curator_playlists cp ON cp.id = s.curator_playlist_id
  WHERE s.submitter_user_id = auth.uid()
  ORDER BY s.created_at DESC;
$$;

-- Also expose the invited playlists a user can submit to, with available points.
CREATE OR REPLACE FUNCTION public.list_playlists_for_submission()
RETURNS TABLE(
  id uuid, curator_id uuid, curator_username text,
  spotify_playlist_id text, name text, image_url text,
  available_points int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT cp.id, cp.curator_id, p.username,
         cp.spotify_playlist_id, cp.name, cp.image_url,
         public.get_playlist_available_points(cp.id)
  FROM public.curator_playlists cp
  JOIN public.profiles p ON p.id = cp.curator_id
  WHERE cp.curator_id <> auth.uid()
    AND public.is_accepted_invitee(cp.curator_id, auth.uid());
$$;

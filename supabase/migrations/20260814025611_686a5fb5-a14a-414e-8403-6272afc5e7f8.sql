CREATE TYPE public.playlist_platform AS ENUM ('spotify','apple_music','youtube','tidal');
CREATE TYPE public.playlist_submission_status AS ENUM ('pending','approved','rejected');

CREATE TABLE public.playlist_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform public.playlist_platform NOT NULL,
  playlist_url text NOT NULL,
  track_url text,
  note text,
  status public.playlist_submission_status NOT NULL DEFAULT 'pending',
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.playlist_submissions TO authenticated;
GRANT UPDATE (status, admin_note, reviewed_at, updated_at) ON public.playlist_submissions TO authenticated;
GRANT ALL ON public.playlist_submissions TO service_role;

ALTER TABLE public.playlist_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own playlist submissions"
ON public.playlist_submissions FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins read all playlist submissions"
ON public.playlist_submissions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Artists submit playlists"
ON public.playlist_submissions FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.account_type IN ('artist','pioneer')
  )
);

CREATE POLICY "Admins update playlist submissions"
ON public.playlist_submissions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_playlist_submissions_updated_at
BEFORE UPDATE ON public.playlist_submissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_playlist_submissions_status_created ON public.playlist_submissions (status, created_at DESC);
CREATE INDEX idx_playlist_submissions_user ON public.playlist_submissions (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.list_playlist_submissions_admin()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  username text,
  account_type public.account_type,
  platform public.playlist_platform,
  playlist_url text,
  track_url text,
  note text,
  status public.playlist_submission_status,
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.user_id, p.username, p.account_type, s.platform, s.playlist_url,
         s.track_url, s.note, s.status, s.admin_note, s.reviewed_at, s.created_at
  FROM public.playlist_submissions s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY s.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.review_playlist_submission(
  _id uuid,
  _status public.playlist_submission_status,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.playlist_submissions
     SET status = _status,
         admin_note = _note,
         reviewed_at = now(),
         updated_at = now()
   WHERE id = _id;
END;
$$;
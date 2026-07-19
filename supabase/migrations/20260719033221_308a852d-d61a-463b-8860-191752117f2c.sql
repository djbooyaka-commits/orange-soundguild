
CREATE TABLE public.track_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(track_id, user_id)
);

GRANT SELECT ON public.track_collaborators TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.track_collaborators TO authenticated;
GRANT ALL ON public.track_collaborators TO service_role;

ALTER TABLE public.track_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view collaborators"
  ON public.track_collaborators FOR SELECT
  USING (true);

CREATE POLICY "Uploader manages collaborators"
  ON public.track_collaborators FOR ALL
  USING (EXISTS (SELECT 1 FROM public.tracks t WHERE t.id = track_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tracks t WHERE t.id = track_id AND t.user_id = auth.uid()));

CREATE INDEX track_collaborators_user_idx ON public.track_collaborators(user_id);
CREATE INDEX track_collaborators_track_idx ON public.track_collaborators(track_id);

-- Search users by username for the collaborator picker
CREATE OR REPLACE FUNCTION public.search_profiles_by_username(_q text)
RETURNS TABLE(id uuid, username text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.avatar_url
  FROM public.profiles p
  WHERE _q IS NOT NULL
    AND length(btrim(_q)) >= 2
    AND p.username ILIKE (btrim(_q) || '%')
    AND (p.is_banned IS NULL OR p.is_banned = false)
  ORDER BY p.username
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.search_profiles_by_username(text) TO authenticated;


DROP POLICY IF EXISTS "Artists can insert their own tracks" ON public.tracks;

CREATE POLICY "Artists and pioneers can insert their own tracks"
ON public.tracks
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    is_artist(auth.uid())
    OR COALESCE((SELECT account_type::text FROM public.profiles WHERE id = auth.uid()), '') = 'pioneer'
  )
);

DROP TRIGGER IF EXISTS enforce_pioneer_track_limit_trg ON public.tracks;
CREATE TRIGGER enforce_pioneer_track_limit_trg
BEFORE INSERT ON public.tracks
FOR EACH ROW EXECUTE FUNCTION public.enforce_pioneer_track_limit();

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
  );
$$;
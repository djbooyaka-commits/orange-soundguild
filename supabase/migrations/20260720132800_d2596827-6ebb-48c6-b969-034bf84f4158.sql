GRANT SELECT ON public.track_collaborators TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.track_collaborators TO authenticated;
GRANT ALL ON public.track_collaborators TO service_role;
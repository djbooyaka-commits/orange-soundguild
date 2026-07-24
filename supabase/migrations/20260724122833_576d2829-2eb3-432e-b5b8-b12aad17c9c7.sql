ALTER TABLE public.osg_artist_follow_links
  DROP CONSTRAINT IF EXISTS osg_artist_follow_links_curator_id_fkey,
  DROP CONSTRAINT IF EXISTS osg_artist_follow_links_user_id_fkey;

ALTER TABLE public.osg_artist_follow_links
  ADD CONSTRAINT osg_artist_follow_links_curator_profile_fkey
    FOREIGN KEY (curator_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT osg_artist_follow_links_user_profile_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

REVOKE ALL ON FUNCTION public.upsert_osg_artist_follow_link(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_osg_artist_follow_link(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_osg_artist_follow_link(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_osg_artist_follow_link(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.list_osg_artist_follow_links() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_osg_artist_follow_links() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_osg_artist_follow_links() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_osg_artist_follow_links() TO service_role;
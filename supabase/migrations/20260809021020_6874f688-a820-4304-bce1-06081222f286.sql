REVOKE EXECUTE ON FUNCTION public.osg_adjust_points(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.osg_adjust_points(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.osg_adjust_points(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.osg_adjust_points(uuid, integer, text) TO service_role;
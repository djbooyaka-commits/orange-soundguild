REVOKE EXECUTE ON FUNCTION public.beta_room_points_by_playlist(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beta_room_points_by_playlist(uuid, uuid) TO service_role;
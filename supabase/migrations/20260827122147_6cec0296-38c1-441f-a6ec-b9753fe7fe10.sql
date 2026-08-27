DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'set_curator_playlist_is_team',
        'list_my_curator_team_rooms',
        'curator_team_roster',
        'curator_team_add_member',
        'curator_team_remove_member',
        'curator_team_set_links',
        'curator_team_adjust_points',
        'curator_team_set_weekly_min'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END $$;
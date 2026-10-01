ALTER TABLE public.beta_room_playlists ADD COLUMN IF NOT EXISTS min_period_days integer NOT NULL DEFAULT 7;
ALTER TABLE public.curator_playlists ADD COLUMN IF NOT EXISTS min_period_days integer NOT NULL DEFAULT 7;

CREATE OR REPLACE FUNCTION public.curator_team_set_min_period(_playlist_id uuid, _days integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _days NOT IN (7, 30) THEN RAISE EXCEPTION 'Period must be 7 or 30 days'; END IF;
  UPDATE public.curator_playlists SET min_period_days = _days
  WHERE id = _playlist_id AND curator_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the curator can do that'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.curator_team_set_min_period(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.curator_team_set_min_period(uuid, integer) TO authenticated;
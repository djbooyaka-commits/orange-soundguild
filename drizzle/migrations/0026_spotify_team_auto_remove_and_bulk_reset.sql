ALTER TABLE public.curator_playlists ADD COLUMN IF NOT EXISTS auto_remove_stars integer;
ALTER TABLE public.curator_team_point_adjustments ADD COLUMN IF NOT EXISTS batch_id uuid;
ALTER TABLE public.beta_point_adjustments ADD COLUMN IF NOT EXISTS batch_id uuid;

CREATE TABLE public.curator_team_auto_removals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.curator_playlists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  spotify_track_id text NOT NULL,
  removed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, user_id, spotify_track_id)
);
GRANT ALL ON public.curator_team_auto_removals TO service_role;
ALTER TABLE public.curator_team_auto_removals ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.curator_team_set_min_period(_playlist_id uuid, _days integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF _days NOT IN (1, 7, 30) THEN RAISE EXCEPTION 'Period must be 1, 7 or 30 days'; END IF;
  UPDATE public.curator_playlists SET min_period_days = _days
  WHERE id = _playlist_id AND curator_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the curator can do that'; END IF;
END $function$;
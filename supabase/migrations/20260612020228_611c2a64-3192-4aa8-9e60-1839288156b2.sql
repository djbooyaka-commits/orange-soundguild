ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS plays_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.record_track_play(p_track_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.tracks SET plays_count = plays_count + 1 WHERE id = p_track_id;
$$;

GRANT EXECUTE ON FUNCTION public.record_track_play(uuid) TO anon, authenticated;
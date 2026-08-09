CREATE OR REPLACE FUNCTION public.admin_set_track_genre(_track_id uuid, _genre text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _genre IS NULL OR btrim(_genre) = '' THEN
    RAISE EXCEPTION 'Genre required';
  END IF;
  UPDATE public.tracks SET genre = btrim(_genre) WHERE id = _track_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_track_genre(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_track_genre(uuid, text) TO authenticated;
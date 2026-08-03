CREATE OR REPLACE FUNCTION public.curator_set_osg_artist_follow_link(_artist_id uuid, _spotify_artist_id text, _spotify_artist_url text, _spotify_artist_name text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_curator uuid := auth.uid();
  v_id uuid;
  v_artist_id text := btrim(coalesce(_spotify_artist_id, ''));
  v_artist_url text := btrim(coalesce(_spotify_artist_url, ''));
BEGIN
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _artist_id IS NULL THEN RAISE EXCEPTION 'Missing artist'; END IF;
  IF v_artist_id !~ '^[A-Za-z0-9]{16,}$' THEN RAISE EXCEPTION 'Invalid Spotify artist id'; END IF;
  IF v_artist_url !~ '^https://open\.spotify\.com/artist/[A-Za-z0-9]+' THEN RAISE EXCEPTION 'Invalid Spotify artist URL'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.osg_artist_picks p
    WHERE p.user_id = v_curator AND p.artist_id = _artist_id
  ) THEN
    RAISE EXCEPTION 'That user is not on your OSG Artists list';
  END IF;

  INSERT INTO public.osg_artist_follow_links(curator_id, user_id, spotify_artist_id, spotify_artist_url, spotify_artist_name)
  VALUES (v_curator, _artist_id, v_artist_id, v_artist_url, NULLIF(btrim(_spotify_artist_name), ''))
  ON CONFLICT (curator_id, user_id) DO UPDATE
    SET spotify_artist_id = EXCLUDED.spotify_artist_id,
        spotify_artist_url = EXCLUDED.spotify_artist_url,
        spotify_artist_name = EXCLUDED.spotify_artist_name,
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.curator_set_osg_artist_follow_link(uuid, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.curator_set_osg_artist_follow_link(uuid, text, text, text) TO authenticated;
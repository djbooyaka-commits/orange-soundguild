ALTER TABLE public.osg_artist_follow_links
  ADD COLUMN IF NOT EXISTS track_urls text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.osg_artist_follow_links
  ALTER COLUMN spotify_artist_id DROP NOT NULL,
  ALTER COLUMN spotify_artist_url DROP NOT NULL;

DROP FUNCTION IF EXISTS public.list_osg_artist_follow_links();

CREATE OR REPLACE FUNCTION public.list_osg_artist_follow_links()
 RETURNS TABLE(curator_id uuid, user_id uuid, spotify_artist_id text, spotify_artist_url text, spotify_artist_name text, track_urls text[], updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT l.curator_id, l.user_id, l.spotify_artist_id, l.spotify_artist_url, l.spotify_artist_name, l.track_urls, l.updated_at
  FROM public.osg_artist_follow_links l
  WHERE l.curator_id = auth.uid()
     OR EXISTS (
       SELECT 1
       FROM public.osg_artist_picks p
       WHERE p.user_id = l.curator_id
         AND p.artist_id = auth.uid()
     )
  ORDER BY l.updated_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.curator_set_osg_track_links(_artist_id uuid, _urls text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_curator uuid := auth.uid();
  v_id uuid;
  v_clean text[];
BEGIN
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _artist_id IS NULL THEN RAISE EXCEPTION 'Missing artist'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.osg_artist_picks p
    WHERE p.user_id = v_curator AND p.artist_id = _artist_id
  ) THEN
    RAISE EXCEPTION 'That user is not on your OSG Artists list';
  END IF;

  SELECT coalesce(array_agg(u ORDER BY ord), '{}'::text[])
    INTO v_clean
  FROM (
    SELECT btrim(u) AS u, ord
    FROM unnest(coalesce(_urls, '{}'::text[])) WITH ORDINALITY AS t(u, ord)
  ) s
  WHERE s.u <> '' AND s.u ~ '^https?://' AND length(s.u) <= 500;

  IF array_length(v_clean, 1) > 5 THEN
    v_clean := v_clean[1:5];
  END IF;

  INSERT INTO public.osg_artist_follow_links(curator_id, user_id, track_urls)
  VALUES (v_curator, _artist_id, v_clean)
  ON CONFLICT (curator_id, user_id) DO UPDATE
    SET track_urls = EXCLUDED.track_urls,
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.curator_set_osg_track_links(uuid, text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.curator_set_osg_track_links(uuid, text[]) TO authenticated;
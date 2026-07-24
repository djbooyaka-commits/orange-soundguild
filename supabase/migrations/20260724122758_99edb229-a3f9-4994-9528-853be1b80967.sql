CREATE TABLE public.osg_artist_follow_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  curator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spotify_artist_id text NOT NULL,
  spotify_artist_url text NOT NULL,
  spotify_artist_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT osg_artist_follow_links_unique UNIQUE (curator_id, user_id),
  CONSTRAINT osg_artist_follow_links_artist_id_format CHECK (spotify_artist_id ~ '^[A-Za-z0-9]{16,}$'),
  CONSTRAINT osg_artist_follow_links_url_format CHECK (spotify_artist_url ~ '^https://open\.spotify\.com/artist/[A-Za-z0-9]+')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.osg_artist_follow_links TO authenticated;
GRANT ALL ON public.osg_artist_follow_links TO service_role;

ALTER TABLE public.osg_artist_follow_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "OSG members and curators can view follow links"
ON public.osg_artist_follow_links
FOR SELECT
TO authenticated
USING (
  curator_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.osg_artist_picks p
    WHERE p.user_id = osg_artist_follow_links.curator_id
      AND p.artist_id = auth.uid()
  )
);

CREATE POLICY "OSG members can add their own follow link"
ON public.osg_artist_follow_links
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.osg_artist_picks p
    WHERE p.user_id = osg_artist_follow_links.curator_id
      AND p.artist_id = auth.uid()
  )
);

CREATE POLICY "OSG members can update their own follow link"
ON public.osg_artist_follow_links
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.osg_artist_picks p
    WHERE p.user_id = osg_artist_follow_links.curator_id
      AND p.artist_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.osg_artist_picks p
    WHERE p.user_id = osg_artist_follow_links.curator_id
      AND p.artist_id = auth.uid()
  )
);

CREATE POLICY "OSG members can delete their own follow link"
ON public.osg_artist_follow_links
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.osg_artist_picks p
    WHERE p.user_id = osg_artist_follow_links.curator_id
      AND p.artist_id = auth.uid()
  )
);

CREATE TRIGGER update_osg_artist_follow_links_updated_at
BEFORE UPDATE ON public.osg_artist_follow_links
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.upsert_osg_artist_follow_link(_curator_id uuid, _spotify_artist_id text, _spotify_artist_url text, _spotify_artist_name text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_artist_id text := btrim(coalesce(_spotify_artist_id, ''));
  v_artist_url text := btrim(coalesce(_spotify_artist_url, ''));
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _curator_id IS NULL THEN RAISE EXCEPTION 'Missing curator'; END IF;
  IF length(v_artist_id) = 0 THEN RAISE EXCEPTION 'Missing Spotify artist id'; END IF;
  IF v_artist_id !~ '^[A-Za-z0-9]{16,}$' THEN RAISE EXCEPTION 'Invalid Spotify artist id'; END IF;
  IF v_artist_url !~ '^https://open\.spotify\.com/artist/[A-Za-z0-9]+' THEN RAISE EXCEPTION 'Invalid Spotify artist URL'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.osg_artist_picks p
    WHERE p.user_id = _curator_id AND p.artist_id = v_user
  ) THEN
    RAISE EXCEPTION 'Not a member of this OSG artist list';
  END IF;

  INSERT INTO public.osg_artist_follow_links(curator_id, user_id, spotify_artist_id, spotify_artist_url, spotify_artist_name)
  VALUES (_curator_id, v_user, v_artist_id, v_artist_url, NULLIF(btrim(_spotify_artist_name), ''))
  ON CONFLICT (curator_id, user_id) DO UPDATE
    SET spotify_artist_id = EXCLUDED.spotify_artist_id,
        spotify_artist_url = EXCLUDED.spotify_artist_url,
        spotify_artist_name = EXCLUDED.spotify_artist_name,
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_osg_artist_follow_links()
RETURNS TABLE(curator_id uuid, user_id uuid, spotify_artist_id text, spotify_artist_url text, spotify_artist_name text, updated_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT l.curator_id, l.user_id, l.spotify_artist_id, l.spotify_artist_url, l.spotify_artist_name, l.updated_at
  FROM public.osg_artist_follow_links l
  WHERE l.curator_id = auth.uid()
     OR EXISTS (
       SELECT 1
       FROM public.osg_artist_picks p
       WHERE p.user_id = l.curator_id
         AND p.artist_id = auth.uid()
     )
  ORDER BY l.updated_at DESC;
$$;
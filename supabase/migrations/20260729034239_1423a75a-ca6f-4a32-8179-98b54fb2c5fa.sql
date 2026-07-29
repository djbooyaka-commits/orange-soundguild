
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX posts_expires_created_idx ON public.posts (expires_at, created_at DESC);
CREATE INDEX posts_user_id_idx ON public.posts (user_id);

GRANT SELECT ON public.posts TO anon;
GRANT SELECT, INSERT, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read non-expired posts"
  ON public.posts FOR SELECT
  USING (expires_at > now());

CREATE POLICY "Authenticated users can insert their own posts"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts or admins any"
  ON public.posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.validate_post_body()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.body := btrim(NEW.body);
  IF char_length(NEW.body) < 1 OR char_length(NEW.body) > 280 THEN
    RAISE EXCEPTION 'Post body must be 1 to 280 characters';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER posts_validate_body
BEFORE INSERT OR UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.validate_post_body();

CREATE TRIGGER posts_set_updated_at
BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.purge_expired_posts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.posts WHERE expires_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

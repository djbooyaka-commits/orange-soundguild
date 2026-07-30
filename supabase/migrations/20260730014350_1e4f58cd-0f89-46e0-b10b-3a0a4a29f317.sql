ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.posts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS posts_parent_id_idx ON public.posts(parent_id, created_at);

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
  IF TG_OP = 'INSERT' AND NEW.body ~* '(https?://|www\.)[^\s]+' THEN
    NEW.expires_at := NEW.created_at + interval '8 days';
  END IF;
  RETURN NEW;
END;
$$;
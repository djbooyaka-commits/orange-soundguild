CREATE OR REPLACE FUNCTION public.validate_post_body()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.body := btrim(NEW.body);
  IF char_length(NEW.body) < 1 OR char_length(NEW.body) > 280 THEN
    RAISE EXCEPTION 'Post body must be 1 to 280 characters';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.extend_post_expiry_on_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.posts
  SET expires_at = GREATEST(expires_at, now()) + interval '1 day'
  WHERE id = NEW.post_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_extend_post_expiry_on_like ON public.post_likes;
CREATE TRIGGER trg_extend_post_expiry_on_like
AFTER INSERT ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.extend_post_expiry_on_like();
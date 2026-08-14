CREATE OR REPLACE FUNCTION public.enforce_playlist_submission_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _type public.account_type;
  _limit int;
  _count int;
BEGIN
  SELECT account_type INTO _type FROM public.profiles WHERE id = NEW.user_id;
  IF _type = 'artist' THEN
    _limit := 3;
  ELSIF _type = 'pioneer' THEN
    _limit := 1;
  ELSE
    RAISE EXCEPTION 'Only Artist and Pioneer Artist accounts can submit playlists';
  END IF;

  SELECT count(*) INTO _count
  FROM public.playlist_submissions
  WHERE user_id = NEW.user_id
    AND created_at > now() - interval '15 days';

  IF _count >= _limit THEN
    RAISE EXCEPTION 'Submission limit reached: % every 15 days for your account type', _limit;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_playlist_submission_limit ON public.playlist_submissions;
CREATE TRIGGER enforce_playlist_submission_limit
BEFORE INSERT ON public.playlist_submissions
FOR EACH ROW EXECUTE FUNCTION public.enforce_playlist_submission_limit();
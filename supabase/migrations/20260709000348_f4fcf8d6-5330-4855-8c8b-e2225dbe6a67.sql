
-- Clear prices for tracks owned by non-artist accounts
UPDATE public.tracks t
SET price_cents = NULL
FROM public.profiles p
WHERE t.user_id = p.id
  AND t.price_cents IS NOT NULL
  AND p.account_type <> 'artist';

-- Trigger: only artist accounts may set a price on a track
CREATE OR REPLACE FUNCTION public.enforce_artist_only_track_sales()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type public.account_type;
BEGIN
  IF NEW.price_cents IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT account_type INTO v_type FROM public.profiles WHERE id = NEW.user_id;
  IF v_type IS DISTINCT FROM 'artist' THEN
    RAISE EXCEPTION 'Only Artist accounts can sell tracks. Upgrade to Artist to set a price.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_artist_only_track_sales_ins ON public.tracks;
DROP TRIGGER IF EXISTS enforce_artist_only_track_sales_upd ON public.tracks;

CREATE TRIGGER enforce_artist_only_track_sales_ins
BEFORE INSERT ON public.tracks
FOR EACH ROW EXECUTE FUNCTION public.enforce_artist_only_track_sales();

CREATE TRIGGER enforce_artist_only_track_sales_upd
BEFORE UPDATE OF price_cents, user_id ON public.tracks
FOR EACH ROW EXECUTE FUNCTION public.enforce_artist_only_track_sales();

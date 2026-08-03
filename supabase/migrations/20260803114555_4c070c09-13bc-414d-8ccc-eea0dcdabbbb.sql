-- 1) profiles: column-level UPDATE grants (privileged columns not client-writable)
REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM anon;
GRANT UPDATE (
  username, avatar_url, bio, updated_at, tos_accepted, osg_weekly_min,
  website_url, twitter_url, instagram_url, tiktok_url, youtube_url, spotify_url, facebook_url
) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 2) artist_subscriptions: no direct client inserts
DROP POLICY IF EXISTS "own subs insert" ON public.artist_subscriptions;
REVOKE INSERT ON public.artist_subscriptions FROM authenticated;
REVOKE INSERT ON public.artist_subscriptions FROM anon;
GRANT SELECT ON public.artist_subscriptions TO authenticated;
GRANT ALL ON public.artist_subscriptions TO service_role;

-- 3) ad_campaigns: server-side validation of amount_cents vs package
CREATE OR REPLACE FUNCTION public.validate_ad_campaign_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected integer;
  v_max_placements integer;
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  CASE NEW.package
    WHEN 'bronze' THEN v_expected := 500;  v_max_placements := 1;
    WHEN 'silver' THEN v_expected := 1250; v_max_placements := 2;
    WHEN 'gold'   THEN v_expected := 3000; v_max_placements := 2;
    ELSE RAISE EXCEPTION 'Unknown ad package';
  END CASE;

  IF NEW.amount_cents IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Invalid amount for % package', NEW.package;
  END IF;

  IF NEW.placements IS NULL
     OR array_length(NEW.placements, 1) IS NULL
     OR array_length(NEW.placements, 1) > v_max_placements THEN
    RAISE EXCEPTION 'Invalid placements for % package', NEW.package;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_ad_campaign_amount_trg ON public.ad_campaigns;
CREATE TRIGGER validate_ad_campaign_amount_trg
BEFORE INSERT OR UPDATE ON public.ad_campaigns
FOR EACH ROW EXECUTE FUNCTION public.validate_ad_campaign_amount();
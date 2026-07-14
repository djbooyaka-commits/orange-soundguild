
-- 1) Lock down profile self-updates to safe columns only.
REVOKE UPDATE ON public.profiles FROM anon, authenticated, PUBLIC;
GRANT UPDATE (
  username, avatar_url, bio,
  website_url, twitter_url, instagram_url, tiktok_url,
  youtube_url, spotify_url, facebook_url,
  tos_accepted
) ON public.profiles TO authenticated;

-- Strengthen the trigger to also block tos_accepted_at tampering.
CREATE OR REPLACE FUNCTION public.prevent_account_type_self_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_admin := public.has_role(auth.uid(), 'admin');
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
    RAISE EXCEPTION 'Only admins can change account_type';
  END IF;
  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    RAISE EXCEPTION 'Only admins can change is_banned';
  END IF;
  IF NEW.credit_balance_cents IS DISTINCT FROM OLD.credit_balance_cents THEN
    RAISE EXCEPTION 'Only admins can change credit_balance_cents';
  END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'referral_code cannot be modified';
  END IF;
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    RAISE EXCEPTION 'referred_by cannot be modified';
  END IF;
  IF NEW.royalty_test_override IS DISTINCT FROM OLD.royalty_test_override THEN
    RAISE EXCEPTION 'Only admins can change royalty_test_override';
  END IF;
  IF NEW.tos_accepted_at IS DISTINCT FROM OLD.tos_accepted_at THEN
    RAISE EXCEPTION 'tos_accepted_at cannot be modified directly';
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Tighten ad_campaigns INSERT: must start as 'pending' with no active dates.
DROP POLICY IF EXISTS "Users can insert their own campaigns" ON public.ad_campaigns;
CREATE POLICY "Users can insert their own campaigns"
  ON public.ad_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'::ad_status
    AND starts_at IS NULL
    AND ends_at IS NULL
  );

-- Also prevent users from flipping status/dates via UPDATE. Only admins/service role can activate.
DROP POLICY IF EXISTS "Users can update their own campaigns" ON public.ad_campaigns;
CREATE POLICY "Users can update their own draft campaigns"
  ON public.ad_campaigns
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending'::ad_status)
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'::ad_status
    AND starts_at IS NULL
    AND ends_at IS NULL
  );

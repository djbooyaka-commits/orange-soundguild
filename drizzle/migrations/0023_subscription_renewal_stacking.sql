CREATE OR REPLACE FUNCTION public.subscription_renewal_expiration(_expires_at timestamptz, _paid_at timestamptz) RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT GREATEST(COALESCE(_expires_at, _paid_at), _paid_at) + interval '30 days' $$;
REVOKE ALL ON FUNCTION public.subscription_renewal_expiration(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_renewal_expiration(timestamptz, timestamptz) TO service_role;
CREATE OR REPLACE FUNCTION public.stack_subscription_renewal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE previous_expiration timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text || ':' || NEW.tier, 0));
  SELECT max(expires_at) INTO previous_expiration FROM public.artist_subscriptions WHERE user_id = NEW.user_id AND tier = NEW.tier;
  NEW.expires_at := public.subscription_renewal_expiration(previous_expiration, now());
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stack_subscription_renewal() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stack_subscription_renewal() TO service_role;
CREATE TRIGGER stack_subscription_renewal BEFORE INSERT ON public.artist_subscriptions FOR EACH ROW EXECUTE FUNCTION public.stack_subscription_renewal();
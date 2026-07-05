-- Enum for placement + package (stored as text[] for placements so we can pick multiple)
DO $$ BEGIN
  CREATE TYPE public.ad_package AS ENUM ('bronze','silver','gold');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ad_mode AS ENUM ('track','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ad_status AS ENUM ('pending','active','expired','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package public.ad_package NOT NULL,
  placements text[] NOT NULL CHECK (
    array_length(placements, 1) BETWEEN 1 AND 2
    AND placements <@ ARRAY['feed','player']::text[]
  ),
  mode public.ad_mode NOT NULL,
  track_id uuid REFERENCES public.tracks(id) ON DELETE SET NULL,
  image_url text,
  headline text,
  dest_url text,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  paypal_order_id text UNIQUE,
  status public.ad_status NOT NULL DEFAULT 'pending',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (mode = 'track' AND track_id IS NOT NULL) OR
    (mode = 'custom' AND image_url IS NOT NULL AND headline IS NOT NULL AND dest_url IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ad_campaigns_active_idx
  ON public.ad_campaigns (status, ends_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ad_campaigns_user_idx
  ON public.ad_campaigns (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.ad_campaigns TO authenticated;
GRANT SELECT ON public.ad_campaigns TO anon;
GRANT ALL ON public.ad_campaigns TO service_role;

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own campaigns"
  ON public.ad_campaigns FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own campaigns"
  ON public.ad_campaigns FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view active campaigns"
  ON public.ad_campaigns FOR SELECT TO anon, authenticated
  USING (status = 'active' AND (ends_at IS NULL OR ends_at > now()));

CREATE POLICY "Admins can manage all campaigns"
  ON public.ad_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_ad_campaigns_updated_at
  BEFORE UPDATE ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
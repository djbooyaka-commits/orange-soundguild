DROP POLICY IF EXISTS "Anyone can view active campaigns" ON public.ad_campaigns;

CREATE OR REPLACE VIEW public.ad_campaigns_public
WITH (security_invoker=on) AS
SELECT id, mode, image_url, headline, dest_url, track_id, placements, status, starts_at, ends_at
FROM public.ad_campaigns
WHERE status = 'active'::ad_status
  AND (ends_at IS NULL OR ends_at > now());

GRANT SELECT ON public.ad_campaigns_public TO anon, authenticated;

CREATE POLICY "Public can view active campaign display fields via view"
ON public.ad_campaigns FOR SELECT
USING (status = 'active'::ad_status AND (ends_at IS NULL OR ends_at > now()));

-- Revoke column-level access to sensitive columns from anon/authenticated on base table
REVOKE SELECT ON public.ad_campaigns FROM anon;
REVOKE SELECT ON public.ad_campaigns FROM authenticated;
GRANT SELECT (id, user_id, mode, image_url, headline, dest_url, track_id, placements, status, starts_at, ends_at, created_at, package, amount_cents, paypal_order_id) ON public.ad_campaigns TO authenticated;
GRANT SELECT (id, mode, image_url, headline, dest_url, track_id, placements, status, starts_at, ends_at) ON public.ad_campaigns TO anon;
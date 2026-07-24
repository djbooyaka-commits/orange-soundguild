DROP POLICY IF EXISTS "Public can view active campaign display fields via view" ON public.ad_campaigns;
REVOKE SELECT ON public.ad_campaigns FROM anon, authenticated;
GRANT SELECT (id, user_id, mode, image_url, headline, dest_url, track_id, placements, status, starts_at, ends_at, created_at, updated_at) ON public.ad_campaigns TO authenticated;
GRANT SELECT ON public.ad_campaigns_public TO anon, authenticated;
CREATE POLICY "Owners can view own campaigns full" ON public.ad_campaigns FOR SELECT TO authenticated USING (auth.uid() = user_id);
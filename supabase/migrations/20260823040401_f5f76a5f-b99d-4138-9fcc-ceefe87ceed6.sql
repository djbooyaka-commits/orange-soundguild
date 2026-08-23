ALTER TABLE public.ad_campaigns
  DROP CONSTRAINT IF EXISTS ad_campaigns_amount_matches_package;

ALTER TABLE public.ad_campaigns
  ADD CONSTRAINT ad_campaigns_amount_matches_package
  CHECK (
    (package = 'bronze' AND amount_cents = 500)
    OR (package = 'silver' AND amount_cents = 1250)
    OR (package = 'gold' AND amount_cents = 3000)
  ) NOT VALID;

ALTER TABLE public.ad_campaigns
  DROP CONSTRAINT IF EXISTS ad_campaigns_placements_within_package;

ALTER TABLE public.ad_campaigns
  ADD CONSTRAINT ad_campaigns_placements_within_package
  CHECK (
    placements IS NOT NULL
    AND array_length(placements, 1) >= 1
    AND array_length(placements, 1) <= (CASE WHEN package = 'bronze' THEN 1 ELSE 2 END)
  ) NOT VALID;
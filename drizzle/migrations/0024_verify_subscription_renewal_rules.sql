DO $$ BEGIN
  IF public.subscription_renewal_expiration('2026-11-12T01:24:00Z', '2026-11-02T01:24:00Z') <> '2026-12-12T01:24:00Z'::timestamptz THEN RAISE EXCEPTION 'Early renewal must preserve remaining time'; END IF;
  IF public.subscription_renewal_expiration('2026-11-01T01:24:00Z', '2026-11-02T01:24:00Z') <> '2026-12-02T01:24:00Z'::timestamptz THEN RAISE EXCEPTION 'Expired renewal must add 30 days'; END IF;
  IF public.subscription_renewal_expiration(NULL, '2026-11-02T01:24:00Z') <> '2026-12-02T01:24:00Z'::timestamptz THEN RAISE EXCEPTION 'First subscription must add 30 days'; END IF;
END $$;
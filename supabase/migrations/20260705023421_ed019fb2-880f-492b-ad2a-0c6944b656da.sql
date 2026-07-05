CREATE OR REPLACE FUNCTION public.prevent_account_type_self_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
    -- Allow service_role / backend contexts where no user is signed in
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only admins can change account_type';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
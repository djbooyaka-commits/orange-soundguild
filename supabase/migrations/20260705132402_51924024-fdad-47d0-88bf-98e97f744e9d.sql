ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tos_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz;

GRANT SELECT (id, username, avatar_url, bio, account_type, created_at, updated_at) ON public.profiles TO anon;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ref_code TEXT;
  ref_user UUID;
  v_tos BOOLEAN;
  v_tos_at TIMESTAMPTZ;
BEGIN
  ref_code := NEW.raw_user_meta_data->>'ref_code';
  IF ref_code IS NOT NULL AND length(ref_code) > 0 THEN
    SELECT id INTO ref_user FROM public.profiles WHERE referral_code = upper(ref_code) LIMIT 1;
  END IF;

  v_tos := COALESCE((NEW.raw_user_meta_data->>'tos_accepted')::boolean, false);
  v_tos_at := CASE WHEN v_tos THEN now() ELSE NULL END;

  INSERT INTO public.profiles (id, username, referred_by, tos_accepted, tos_accepted_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), 'user_' || substr(NEW.id::text, 1, 8)),
    ref_user,
    v_tos,
    v_tos_at
  )
  ON CONFLICT (id) DO NOTHING;

  IF NEW.email = 'djbooyaka@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
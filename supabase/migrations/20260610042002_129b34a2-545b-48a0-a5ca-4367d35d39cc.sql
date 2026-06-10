
-- 1) Remove public read policies on private audio/covers buckets.
DROP POLICY IF EXISTS "Public can read audio" ON storage.objects;
DROP POLICY IF EXISTS "Public can read covers" ON storage.objects;

-- 2) Stop copying external OAuth avatar URLs into profiles on signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), 'user_' || substr(NEW.id::text, 1, 8))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 3) Clear any previously stored external avatar URLs (only storage paths should remain).
UPDATE public.profiles
SET avatar_url = NULL
WHERE avatar_url ILIKE 'http%';

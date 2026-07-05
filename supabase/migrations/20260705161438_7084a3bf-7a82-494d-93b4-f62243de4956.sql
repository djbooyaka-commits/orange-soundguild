ALTER TABLE public.profiles DROP COLUMN IF EXISTS soundcloud_url;
ALTER TABLE public.profiles ADD COLUMN facebook_url text;
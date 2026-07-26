
-- === profiles: column-level SELECT grants ===
REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT
  (id, username, avatar_url, bio, created_at, updated_at, account_type,
   website_url, twitter_url, instagram_url, tiktok_url, youtube_url, spotify_url, facebook_url)
  ON public.profiles TO anon, authenticated;

-- === spotify_connections: owner-only policies ===
CREATE POLICY "Owner can select own spotify connection"
  ON public.spotify_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Owner can insert own spotify connection"
  ON public.spotify_connections FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can update own spotify connection"
  ON public.spotify_connections FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can delete own spotify connection"
  ON public.spotify_connections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- === spotify_user_apps: owner-only policies ===
CREATE POLICY "Owner can select own spotify app"
  ON public.spotify_user_apps FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Owner can insert own spotify app"
  ON public.spotify_user_apps FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can update own spotify app"
  ON public.spotify_user_apps FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can delete own spotify app"
  ON public.spotify_user_apps FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- === curator_invites: explicit write policies ===
CREATE POLICY "Curator can create invites"
  ON public.curator_invites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = curator_id);
CREATE POLICY "Invitee can respond to invite"
  ON public.curator_invites FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Curator can withdraw invite"
  ON public.curator_invites FOR DELETE TO authenticated
  USING (auth.uid() = curator_id);

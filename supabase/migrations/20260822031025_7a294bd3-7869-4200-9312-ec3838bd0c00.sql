GRANT SELECT ON public.beta_playlist_tracking_sessions TO authenticated;

CREATE POLICY "Members can view their own tracking sessions"
ON public.beta_playlist_tracking_sessions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Restore public schema table grants (were wiped, causing 401 permission denied)

-- Service role: full access on everything
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Authenticated: standard CRUD (RLS still gates rows)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payout_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pioneer_invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_tracks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_earnings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.royalty_payouts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_content TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.track_likes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.track_plays TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracks TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

-- Anon: read-only on publicly discoverable content (RLS policies further gate)
GRANT SELECT ON public.tracks TO anon;
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.playlists TO anon;
GRANT SELECT ON public.playlist_tracks TO anon;
GRANT SELECT ON public.comments TO anon;
GRANT SELECT ON public.track_likes TO anon;
GRANT SELECT ON public.follows TO anon;
GRANT SELECT ON public.ad_campaigns TO anon;
GRANT SELECT ON public.site_content TO anon;

-- Sequences for authenticated inserts
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

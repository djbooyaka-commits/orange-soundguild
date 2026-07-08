-- Restore Data API privileges for existing public app tables.
-- RLS policies remain in force; these grants only make the tables reachable again.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ad_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.artist_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.direct_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.follows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.friendships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payout_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pioneer_invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.playlist_tracks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.playlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.referral_earnings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.royalty_payouts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_content TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.track_likes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.track_plays TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tracks TO authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Public read grants only for tables with public-facing read policies/content.
GRANT SELECT ON TABLE public.ad_campaigns TO anon;
GRANT SELECT ON TABLE public.comments TO anon;
GRANT SELECT ON TABLE public.follows TO anon;
GRANT SELECT ON TABLE public.playlist_tracks TO anon;
GRANT SELECT ON TABLE public.playlists TO anon;
GRANT SELECT ON TABLE public.profiles TO anon;
GRANT SELECT ON TABLE public.site_content TO anon;
GRANT SELECT ON TABLE public.track_likes TO anon;
GRANT SELECT ON TABLE public.tracks TO anon;
GRANT EXECUTE ON FUNCTION public.get_total_users() TO anon;
GRANT EXECUTE ON FUNCTION public.get_monthly_listeners(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.record_track_play(uuid) TO anon;

-- Keep future app tables/functions reachable by the expected roles unless explicitly revoked later.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
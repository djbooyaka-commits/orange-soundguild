export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ad_campaigns: {
        Row: {
          amount_cents: number
          created_at: string
          dest_url: string | null
          ends_at: string | null
          headline: string | null
          id: string
          image_url: string | null
          mode: Database["public"]["Enums"]["ad_mode"]
          package: Database["public"]["Enums"]["ad_package"]
          paypal_order_id: string | null
          placements: string[]
          starts_at: string | null
          status: Database["public"]["Enums"]["ad_status"]
          track_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          dest_url?: string | null
          ends_at?: string | null
          headline?: string | null
          id?: string
          image_url?: string | null
          mode: Database["public"]["Enums"]["ad_mode"]
          package: Database["public"]["Enums"]["ad_package"]
          paypal_order_id?: string | null
          placements: string[]
          starts_at?: string | null
          status?: Database["public"]["Enums"]["ad_status"]
          track_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          dest_url?: string | null
          ends_at?: string | null
          headline?: string | null
          id?: string
          image_url?: string | null
          mode?: Database["public"]["Enums"]["ad_mode"]
          package?: Database["public"]["Enums"]["ad_package"]
          paypal_order_id?: string | null
          placements?: string[]
          starts_at?: string | null
          status?: Database["public"]["Enums"]["ad_status"]
          track_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_subscriptions: {
        Row: {
          amount: number
          expires_at: string
          from_wallet: string
          id: string
          network: string
          paid_at: string
          tier: string
          token: string
          tx_signature: string
          user_id: string
        }
        Insert: {
          amount: number
          expires_at: string
          from_wallet: string
          id?: string
          network?: string
          paid_at?: string
          tier?: string
          token: string
          tx_signature: string
          user_id: string
        }
        Update: {
          amount?: number
          expires_at?: string
          from_wallet?: string
          id?: string
          network?: string
          paid_at?: string
          tier?: string
          token?: string
          tx_signature?: string
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          body: string
          created_at: string
          edited_at: string | null
          id: string
          parent_id: string | null
          track_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          track_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          track_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      curator_invites: {
        Row: {
          created_at: string
          curator_id: string
          id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["curator_invite_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          curator_id: string
          id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["curator_invite_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          curator_id?: string
          id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["curator_invite_status"]
          user_id?: string
        }
        Relationships: []
      }
      curator_playlist_ignores: {
        Row: {
          created_at: string
          curator_id: string
          spotify_playlist_id: string
        }
        Insert: {
          created_at?: string
          curator_id: string
          spotify_playlist_id: string
        }
        Update: {
          created_at?: string
          curator_id?: string
          spotify_playlist_id?: string
        }
        Relationships: []
      }
      curator_playlists: {
        Row: {
          created_at: string
          curator_id: string
          id: string
          image_url: string | null
          is_osg: boolean
          name: string
          spotify_playlist_id: string
        }
        Insert: {
          created_at?: string
          curator_id: string
          id?: string
          image_url?: string | null
          is_osg?: boolean
          name: string
          spotify_playlist_id: string
        }
        Update: {
          created_at?: string
          curator_id?: string
          id?: string
          image_url?: string | null
          is_osg?: boolean
          name?: string
          spotify_playlist_id?: string
        }
        Relationships: []
      }
      curator_submissions: {
        Row: {
          cost_points: number
          created_at: string
          curator_id: string
          curator_note: string | null
          curator_playlist_id: string
          followed_all_artists: boolean
          id: string
          reviewed_at: string | null
          spotify_track_id: string
          spotify_track_name: string | null
          spotify_track_url: string
          status: Database["public"]["Enums"]["curator_submission_status"]
          submitter_user_id: string
        }
        Insert: {
          cost_points: number
          created_at?: string
          curator_id: string
          curator_note?: string | null
          curator_playlist_id: string
          followed_all_artists?: boolean
          id?: string
          reviewed_at?: string | null
          spotify_track_id: string
          spotify_track_name?: string | null
          spotify_track_url: string
          status?: Database["public"]["Enums"]["curator_submission_status"]
          submitter_user_id: string
        }
        Update: {
          cost_points?: number
          created_at?: string
          curator_id?: string
          curator_note?: string | null
          curator_playlist_id?: string
          followed_all_artists?: boolean
          id?: string
          reviewed_at?: string | null
          spotify_track_id?: string
          spotify_track_name?: string | null
          spotify_track_url?: string
          status?: Database["public"]["Enums"]["curator_submission_status"]
          submitter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curator_submissions_curator_playlist_id_fkey"
            columns: ["curator_playlist_id"]
            isOneToOne: false
            referencedRelation: "curator_playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_messages: {
        Row: {
          body: string | null
          created_at: string
          edited_at: string | null
          id: string
          image_url: string | null
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          edited_at?: string | null
          id?: string
          image_url?: string | null
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          edited_at?: string | null
          id?: string
          image_url?: string | null
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friend_status"]
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["friend_status"]
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["friend_status"]
          updated_at?: string
        }
        Relationships: []
      }
      osg_artist_follow_links: {
        Row: {
          created_at: string
          curator_id: string
          id: string
          spotify_artist_id: string
          spotify_artist_name: string | null
          spotify_artist_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          curator_id: string
          id?: string
          spotify_artist_id: string
          spotify_artist_name?: string | null
          spotify_artist_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          curator_id?: string
          id?: string
          spotify_artist_id?: string
          spotify_artist_name?: string | null
          spotify_artist_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "osg_artist_follow_links_curator_profile_fkey"
            columns: ["curator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "osg_artist_follow_links_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      osg_artist_picks: {
        Row: {
          artist_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      payout_requests: {
        Row: {
          admin_note: string | null
          amount_cents: number
          created_at: string
          destination: string
          id: string
          method: Database["public"]["Enums"]["payout_method"]
          processed_at: string | null
          status: Database["public"]["Enums"]["payout_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount_cents: number
          created_at?: string
          destination: string
          id?: string
          method: Database["public"]["Enums"]["payout_method"]
          processed_at?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount_cents?: number
          created_at?: string
          destination?: string
          id?: string
          method?: Database["public"]["Enums"]["payout_method"]
          processed_at?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pioneer_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          id: string
          max_uses: number | null
          used_at: string | null
          used_by: string | null
          uses_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          id?: string
          max_uses?: number | null
          used_at?: string | null
          used_by?: string | null
          uses_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          id?: string
          max_uses?: number | null
          used_at?: string | null
          used_by?: string | null
          uses_count?: number
        }
        Relationships: []
      }
      playlist_tracks: {
        Row: {
          added_at: string
          playlist_id: string
          position: number
          track_id: string
        }
        Insert: {
          added_at?: string
          playlist_id: string
          position?: number
          track_id: string
        }
        Update: {
          added_at?: string
          playlist_id?: string
          position?: number
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_tracks_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          avatar_url: string | null
          bio: string | null
          created_at: string
          credit_balance_cents: number
          facebook_url: string | null
          id: string
          instagram_url: string | null
          is_banned: boolean
          referral_code: string | null
          referred_by: string | null
          royalty_test_override: boolean
          spotify_url: string | null
          tiktok_url: string | null
          tos_accepted: boolean
          tos_accepted_at: string | null
          twitter_url: string | null
          updated_at: string
          username: string | null
          website_url: string | null
          youtube_url: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          credit_balance_cents?: number
          facebook_url?: string | null
          id: string
          instagram_url?: string | null
          is_banned?: boolean
          referral_code?: string | null
          referred_by?: string | null
          royalty_test_override?: boolean
          spotify_url?: string | null
          tiktok_url?: string | null
          tos_accepted?: boolean
          tos_accepted_at?: string | null
          twitter_url?: string | null
          updated_at?: string
          username?: string | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          credit_balance_cents?: number
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_banned?: boolean
          referral_code?: string | null
          referred_by?: string | null
          royalty_test_override?: boolean
          spotify_url?: string | null
          tiktok_url?: string | null
          tos_accepted?: boolean
          tos_accepted_at?: string | null
          twitter_url?: string | null
          updated_at?: string
          username?: string | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      referral_earnings: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          referred_user_id: string
          referrer_id: string
          subscription_id: string | null
          tier: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          referred_user_id: string
          referrer_id: string
          subscription_id?: string | null
          tier: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          referred_user_id?: string
          referrer_id?: string
          subscription_id?: string | null
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_earnings_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "artist_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      royalty_payouts: {
        Row: {
          amount_cents: number
          artist_weighted_plays: number
          created_at: string
          id: string
          period_start: string
          pool_cents: number
          total_weighted_plays: number
          user_id: string
        }
        Insert: {
          amount_cents: number
          artist_weighted_plays: number
          created_at?: string
          id?: string
          period_start: string
          pool_cents: number
          total_weighted_plays: number
          user_id: string
        }
        Update: {
          amount_cents?: number
          artist_weighted_plays?: number
          created_at?: string
          id?: string
          period_start?: string
          pool_cents?: number
          total_weighted_plays?: number
          user_id?: string
        }
        Relationships: []
      }
      site_content: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      site_expenses: {
        Row: {
          amount_cents: number
          category: string
          created_at: string
          description: string
          id: string
          note: string | null
          spent_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          category?: string
          created_at?: string
          description: string
          id?: string
          note?: string | null
          spent_on?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          category?: string
          created_at?: string
          description?: string
          id?: string
          note?: string | null
          spent_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      spotify_connections: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          last_polled_at: string | null
          refresh_token: string
          scope: string | null
          spotify_user_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          last_polled_at?: string | null
          refresh_token: string
          scope?: string | null
          spotify_user_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          last_polled_at?: string | null
          refresh_token?: string
          scope?: string | null
          spotify_user_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      spotify_user_apps: {
        Row: {
          client_id: string
          client_secret: string
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          client_secret: string
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          client_secret?: string
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stream_points: {
        Row: {
          created_at: string
          curator_playlist_id: string
          id: string
          played_at: string
          spotify_track_id: string
          spotify_track_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          curator_playlist_id: string
          id?: string
          played_at: string
          spotify_track_id: string
          spotify_track_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          curator_playlist_id?: string
          id?: string
          played_at?: string
          spotify_track_id?: string
          spotify_track_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_points_curator_playlist_id_fkey"
            columns: ["curator_playlist_id"]
            isOneToOne: false
            referencedRelation: "curator_playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      track_claim_codes: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          code: string
          created_at: string
          created_by: string
          id: string
          track_id: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          code: string
          created_at?: string
          created_by: string
          id?: string
          track_id: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          code?: string
          created_at?: string
          created_by?: string
          id?: string
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_claim_codes_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_collaborators: {
        Row: {
          created_at: string
          id: string
          position: number
          track_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          track_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          track_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_collaborators_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_likes: {
        Row: {
          created_at: string
          track_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          track_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          track_id?: string
          user_id?: string
        }
        Relationships: []
      }
      track_plays: {
        Row: {
          created_at: string
          id: string
          sub_tier: string | null
          track_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          sub_tier?: string | null
          track_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          sub_tier?: string | null
          track_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "track_plays_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_purchases: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          price_cents: number
          track_id: string
          tx_ref: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          method: string
          price_cents?: number
          track_id: string
          tx_ref: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          price_cents?: number
          track_id?: string
          tx_ref?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_purchases_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      tracks: {
        Row: {
          album: string | null
          audio_url: string
          cover_art_url: string | null
          created_at: string
          download_lossless_url: string | null
          genre: string
          id: string
          plays_count: number
          price_cents: number | null
          title: string
          track_number: number | null
          user_id: string
        }
        Insert: {
          album?: string | null
          audio_url: string
          cover_art_url?: string | null
          created_at?: string
          download_lossless_url?: string | null
          genre: string
          id?: string
          plays_count?: number
          price_cents?: number | null
          title: string
          track_number?: number | null
          user_id: string
        }
        Update: {
          album?: string | null
          audio_url?: string
          cover_art_url?: string | null
          created_at?: string
          download_lossless_url?: string | null
          genre?: string
          id?: string
          plays_count?: number
          price_cents?: number | null
          title?: string
          track_number?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      ad_campaigns_public: {
        Row: {
          dest_url: string | null
          ends_at: string | null
          headline: string | null
          id: string | null
          image_url: string | null
          mode: Database["public"]["Enums"]["ad_mode"] | null
          placements: string[] | null
          starts_at: string | null
          status: Database["public"]["Enums"]["ad_status"] | null
          track_id: string | null
        }
        Insert: {
          dest_url?: string | null
          ends_at?: string | null
          headline?: string | null
          id?: string | null
          image_url?: string | null
          mode?: Database["public"]["Enums"]["ad_mode"] | null
          placements?: string[] | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["ad_status"] | null
          track_id?: string | null
        }
        Update: {
          dest_url?: string | null
          ends_at?: string | null
          headline?: string | null
          id?: string | null
          image_url?: string | null
          mode?: Database["public"]["Enums"]["ad_mode"] | null
          placements?: string[] | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["ad_status"] | null
          track_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_curator_invite_by_link: {
        Args: { _curator_id: string }
        Returns: string
      }
      add_osg_artist_pick: { Args: { _username: string }; Returns: string }
      admin_set_account_type: {
        Args: {
          _type: Database["public"]["Enums"]["account_type"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_set_banned: {
        Args: { _banned: boolean; _user_id: string }
        Returns: undefined
      }
      admin_update_payout_status: {
        Args: {
          _new_status: Database["public"]["Enums"]["payout_status"]
          _note?: string
          _request_id: string
        }
        Returns: undefined
      }
      are_friends: { Args: { _a: string; _b: string }; Returns: boolean }
      can_use_osg_artists: { Args: never; Returns: boolean }
      cancel_curator_invite: {
        Args: { _invite_id: string }
        Returns: undefined
      }
      claim_referral: { Args: { _code: string }; Returns: boolean }
      claim_track_code: { Args: { _code: string }; Returns: string }
      create_pioneer_invite: { Args: never; Returns: string }
      credit_referral: {
        Args: {
          _referred_user: string
          _subscription_id: string
          _tier: string
        }
        Returns: undefined
      }
      credit_track_sale: {
        Args: { _amount_cents: number; _track_id: string }
        Returns: undefined
      }
      generate_referral_code: { Args: never; Returns: string }
      generate_track_codes: {
        Args: { _count: number; _track_id: string }
        Returns: string[]
      }
      get_curator_earned_points: { Args: never; Returns: number }
      get_monthly_listeners: { Args: { _artist_id: string }; Returns: number }
      get_my_referral_info: {
        Args: never
        Returns: {
          account_type: Database["public"]["Enums"]["account_type"]
          balance_cents: number
          referral_code: string
          referred_count: number
        }[]
      }
      get_my_stream_points: { Args: never; Returns: number }
      get_playlist_available_points: {
        Args: { _playlist_id: string }
        Returns: number
      }
      get_playlist_earned_points: {
        Args: { _playlist_id: string }
        Returns: number
      }
      get_royalty_progress: {
        Args: { _user_id: string }
        Returns: {
          artist_referrals: number
          eligible: boolean
          followers: number
          superfan_referrals: number
        }[]
      }
      get_total_users: { Args: never; Returns: number }
      get_track_share_ref: { Args: { _track_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invite_curator_user: { Args: { _username: string }; Returns: string }
      is_accepted_invitee: {
        Args: { _curator: string; _user: string }
        Returns: boolean
      }
      is_artist: { Args: { _user_id: string }; Returns: boolean }
      is_banned: { Args: { _user_id: string }; Returns: boolean }
      is_royalty_eligible: { Args: { _user_id: string }; Returns: boolean }
      list_curator_invites_for_me: {
        Args: never
        Returns: {
          created_at: string
          curator_avatar: string
          curator_id: string
          curator_username: string
          id: string
          status: Database["public"]["Enums"]["curator_invite_status"]
        }[]
      }
      list_curator_submissions_for_me: {
        Args: never
        Returns: {
          cost_points: number
          created_at: string
          curator_note: string
          curator_playlist_id: string
          followed_all_artists: boolean
          id: string
          playlist_name: string
          reviewed_at: string
          spotify_track_id: string
          spotify_track_name: string
          spotify_track_url: string
          status: Database["public"]["Enums"]["curator_submission_status"]
          submitter_user_id: string
          submitter_username: string
        }[]
      }
      list_my_curator_invitees: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["curator_invite_status"]
          user_id: string
          username: string
        }[]
      }
      list_my_osg_artist_picks: {
        Args: never
        Returns: {
          account_type: Database["public"]["Enums"]["account_type"]
          artist_id: string
          avatar_url: string
          created_at: string
          id: string
          username: string
          weekly_points: number
        }[]
      }
      list_my_osg_rosters: {
        Args: never
        Returns: {
          account_type: Database["public"]["Enums"]["account_type"]
          artist_id: string
          avatar_url: string
          curator_avatar_url: string
          curator_id: string
          curator_username: string
          is_me: boolean
          username: string
          weekly_points: number
        }[]
      }
      list_my_track_submissions: {
        Args: never
        Returns: {
          cost_points: number
          created_at: string
          curator_note: string
          curator_playlist_id: string
          followed_all_artists: boolean
          id: string
          playlist_name: string
          reviewed_at: string
          spotify_track_id: string
          spotify_track_name: string
          spotify_track_url: string
          status: Database["public"]["Enums"]["curator_submission_status"]
        }[]
      }
      list_osg_artist_follow_links: {
        Args: never
        Returns: {
          curator_id: string
          spotify_artist_id: string
          spotify_artist_name: string
          spotify_artist_url: string
          updated_at: string
          user_id: string
        }[]
      }
      list_osg_playlist_submissions: {
        Args: never
        Returns: {
          created_at: string
          curator_id: string
          spotify_track_id: string
          spotify_track_name: string
          spotify_track_url: string
          status: Database["public"]["Enums"]["curator_submission_status"]
          submitter_user_id: string
        }[]
      }
      list_osg_playlists_for_submission: {
        Args: never
        Returns: {
          available_points: number
          curator_id: string
          curator_username: string
          id: string
          image_url: string
          name: string
          spotify_playlist_id: string
        }[]
      }
      list_playlists_for_submission: {
        Args: never
        Returns: {
          available_points: number
          curator_id: string
          curator_username: string
          id: string
          image_url: string
          name: string
          spotify_playlist_id: string
        }[]
      }
      record_track_play: { Args: { p_track_id: string }; Returns: undefined }
      request_payout: {
        Args: {
          _amount_cents: number
          _destination: string
          _method: Database["public"]["Enums"]["payout_method"]
        }
        Returns: string
      }
      respond_curator_invite: {
        Args: { _accept: boolean; _invite_id: string }
        Returns: undefined
      }
      review_curator_submission: {
        Args: { _approve: boolean; _note?: string; _submission_id: string }
        Returns: undefined
      }
      run_monthly_royalty_payout: {
        Args: { p_period_start?: string }
        Returns: {
          paid_amount_cents: number
          paid_user_id: string
        }[]
      }
      search_profiles_by_username: {
        Args: { _q: string }
        Returns: {
          avatar_url: string
          id: string
          username: string
        }[]
      }
      set_curator_playlist_is_osg: {
        Args: { _is_osg: boolean; _playlist_id: string }
        Returns: undefined
      }
      submit_curator_track: {
        Args: {
          _followed_all: boolean
          _playlist_id: string
          _spotify_track_id: string
          _spotify_track_name: string
          _spotify_track_url: string
        }
        Returns: string
      }
      submit_osg_curator_track: {
        Args: {
          _playlist_id: string
          _spotify_track_id: string
          _spotify_track_name: string
          _spotify_track_url: string
        }
        Returns: string
      }
      upsert_osg_artist_follow_link: {
        Args: {
          _curator_id: string
          _spotify_artist_id: string
          _spotify_artist_name?: string
          _spotify_artist_url: string
        }
        Returns: string
      }
    }
    Enums: {
      account_type: "fan" | "artist" | "superfan" | "pioneer"
      ad_mode: "track" | "custom"
      ad_package: "bronze" | "silver" | "gold"
      ad_status: "pending" | "active" | "expired" | "refunded"
      app_role: "admin" | "user"
      curator_invite_status: "pending" | "accepted" | "declined"
      curator_submission_status: "pending" | "approved" | "rejected"
      friend_status: "pending" | "accepted" | "declined"
      payout_method: "paypal" | "phantom"
      payout_status: "pending" | "processing" | "paid" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["fan", "artist", "superfan", "pioneer"],
      ad_mode: ["track", "custom"],
      ad_package: ["bronze", "silver", "gold"],
      ad_status: ["pending", "active", "expired", "refunded"],
      app_role: ["admin", "user"],
      curator_invite_status: ["pending", "accepted", "declined"],
      curator_submission_status: ["pending", "approved", "rejected"],
      friend_status: ["pending", "accepted", "declined"],
      payout_method: ["paypal", "phantom"],
      payout_status: ["pending", "processing", "paid", "rejected"],
    },
  },
} as const

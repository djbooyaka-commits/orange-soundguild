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
          id: string
          track_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          track_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          track_id?: string
          user_id?: string
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
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          id?: string
          used_at?: string | null
          used_by?: string | null
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
      tracks: {
        Row: {
          album: string | null
          audio_url: string
          cover_art_url: string | null
          created_at: string
          genre: string
          id: string
          plays_count: number
          title: string
          track_number: number | null
          user_id: string
        }
        Insert: {
          album?: string | null
          audio_url: string
          cover_art_url?: string | null
          created_at?: string
          genre: string
          id?: string
          plays_count?: number
          title: string
          track_number?: number | null
          user_id: string
        }
        Update: {
          album?: string | null
          audio_url?: string
          cover_art_url?: string | null
          created_at?: string
          genre?: string
          id?: string
          plays_count?: number
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
      [_ in never]: never
    }
    Functions: {
      admin_update_payout_status: {
        Args: {
          _new_status: Database["public"]["Enums"]["payout_status"]
          _note?: string
          _request_id: string
        }
        Returns: undefined
      }
      create_pioneer_invite: { Args: never; Returns: string }
      credit_referral: {
        Args: {
          _referred_user: string
          _subscription_id: string
          _tier: string
        }
        Returns: undefined
      }
      generate_referral_code: { Args: never; Returns: string }
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_artist: { Args: { _user_id: string }; Returns: boolean }
      is_banned: { Args: { _user_id: string }; Returns: boolean }
      is_royalty_eligible: { Args: { _user_id: string }; Returns: boolean }
      record_track_play: { Args: { p_track_id: string }; Returns: undefined }
      request_payout: {
        Args: {
          _amount_cents: number
          _destination: string
          _method: Database["public"]["Enums"]["payout_method"]
        }
        Returns: string
      }
      run_monthly_royalty_payout: {
        Args: { p_period_start?: string }
        Returns: {
          paid_amount_cents: number
          paid_user_id: string
        }[]
      }
    }
    Enums: {
      account_type: "fan" | "artist" | "superfan" | "pioneer"
      ad_mode: "track" | "custom"
      ad_package: "bronze" | "silver" | "gold"
      ad_status: "pending" | "active" | "expired" | "refunded"
      app_role: "admin" | "user"
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
      payout_method: ["paypal", "phantom"],
      payout_status: ["pending", "processing", "paid", "rejected"],
    },
  },
} as const

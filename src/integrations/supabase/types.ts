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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_summary_log: {
        Row: {
          created_at: string
          id: string
          member_ids: string[]
          sent_at: string
          summary_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_ids?: string[]
          sent_at?: string
          summary_type: string
        }
        Update: {
          created_at?: string
          id?: string
          member_ids?: string[]
          sent_at?: string
          summary_type?: string
        }
        Relationships: []
      }
      custom_packages: {
        Row: {
          created_at: string
          duration_days: number
          id: string
          is_active: boolean
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_days: number
          id?: string
          is_active?: boolean
          name: string
          price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_days?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_pass_subscriptions: {
        Row: {
          created_at: string | null
          daily_pass_user_id: string
          duration_days: number
          end_date: string
          id: string
          package_id: string | null
          package_name: string
          personal_trainer_id: string | null
          price: number
          start_date: string
          status: string
          trainer_fee: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          daily_pass_user_id: string
          duration_days: number
          end_date: string
          id?: string
          package_id?: string | null
          package_name: string
          personal_trainer_id?: string | null
          price: number
          start_date?: string
          status?: string
          trainer_fee?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          daily_pass_user_id?: string
          duration_days?: number
          end_date?: string
          id?: string
          package_id?: string | null
          package_name?: string
          personal_trainer_id?: string | null
          price?: number
          start_date?: string
          status?: string
          trainer_fee?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_pass_subscriptions_daily_pass_user_id_fkey"
            columns: ["daily_pass_user_id"]
            isOneToOne: false
            referencedRelation: "daily_pass_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_pass_subscriptions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "custom_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_pass_subscriptions_personal_trainer_id_fkey"
            columns: ["personal_trainer_id"]
            isOneToOne: false
            referencedRelation: "personal_trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_pass_users: {
        Row: {
          address: string | null
          created_at: string | null
          email: string | null
          gender: string | null
          id: string
          name: string
          phone: string
          photo_id_number: string | null
          photo_id_type: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          gender?: string | null
          id?: string
          name: string
          phone: string
          photo_id_number?: string | null
          photo_id_type?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          gender?: string | null
          id?: string
          name?: string
          phone?: string
          photo_id_number?: string | null
          photo_id_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      gym_settings: {
        Row: {
          gym_address: string | null
          gym_name: string | null
          gym_phone: string | null
          id: string
          joining_fee: number
          monthly_fee: number
          monthly_packages: number[] | null
          updated_at: string | null
          whatsapp_enabled: boolean | null
        }
        Insert: {
          gym_address?: string | null
          gym_name?: string | null
          gym_phone?: string | null
          id?: string
          joining_fee?: number
          monthly_fee?: number
          monthly_packages?: number[] | null
          updated_at?: string | null
          whatsapp_enabled?: boolean | null
        }
        Update: {
          gym_address?: string | null
          gym_name?: string | null
          gym_phone?: string | null
          id?: string
          joining_fee?: number
          monthly_fee?: number
          monthly_packages?: number[] | null
          updated_at?: string | null
          whatsapp_enabled?: boolean | null
        }
        Relationships: []
      }
      member_details: {
        Row: {
          address: string | null
          created_at: string
          gender: string | null
          id: string
          member_id: string
          personal_trainer_id: string | null
          photo_id_number: string | null
          photo_id_type: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          member_id: string
          personal_trainer_id?: string | null
          photo_id_number?: string | null
          photo_id_type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          member_id?: string
          personal_trainer_id?: string | null
          photo_id_number?: string | null
          photo_id_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_details_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_details_personal_trainer_id_fkey"
            columns: ["personal_trainer_id"]
            isOneToOne: false
            referencedRelation: "personal_trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          join_date: string | null
          name: string
          phone: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          join_date?: string | null
          name: string
          phone: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          join_date?: string | null
          name?: string
          phone?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      monthly_packages: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          joining_fee: number
          months: number
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          joining_fee?: number
          months: number
          price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          joining_fee?: number
          months?: number
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          daily_pass_subscription_id: string | null
          daily_pass_user_id: string | null
          id: string
          member_id: string | null
          notes: string | null
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          payment_type: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
          subscription_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          daily_pass_subscription_id?: string | null
          daily_pass_user_id?: string | null
          id?: string
          member_id?: string | null
          notes?: string | null
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          payment_type?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          daily_pass_subscription_id?: string | null
          daily_pass_user_id?: string | null
          id?: string
          member_id?: string | null
          notes?: string | null
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          payment_type?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_daily_pass_subscription_id_fkey"
            columns: ["daily_pass_subscription_id"]
            isOneToOne: false
            referencedRelation: "daily_pass_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_daily_pass_user_id_fkey"
            columns: ["daily_pass_user_id"]
            isOneToOne: false
            referencedRelation: "daily_pass_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_trainers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          monthly_fee: number
          name: string
          phone: string | null
          specialization: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_fee?: number
          name: string
          phone?: string | null
          specialization?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_fee?: number
          name?: string
          phone?: string | null
          specialization?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pt_subscriptions: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          member_id: string
          monthly_fee: number
          personal_trainer_id: string
          start_date: string
          status: string
          total_fee: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          member_id: string
          monthly_fee?: number
          personal_trainer_id: string
          start_date?: string
          status?: string
          total_fee?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          member_id?: string
          monthly_fee?: number
          personal_trainer_id?: string
          start_date?: string
          status?: string
          total_fee?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pt_subscriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_subscriptions_personal_trainer_id_fkey"
            columns: ["personal_trainer_id"]
            isOneToOne: false
            referencedRelation: "personal_trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string | null
          custom_days: number | null
          end_date: string
          id: string
          is_custom_package: boolean | null
          member_id: string
          personal_trainer_id: string | null
          plan_months: number
          pt_end_date: string | null
          pt_start_date: string | null
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"] | null
          trainer_fee: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          custom_days?: number | null
          end_date: string
          id?: string
          is_custom_package?: boolean | null
          member_id: string
          personal_trainer_id?: string | null
          plan_months: number
          pt_end_date?: string | null
          pt_start_date?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"] | null
          trainer_fee?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          custom_days?: number | null
          end_date?: string
          id?: string
          is_custom_package?: boolean | null
          member_id?: string
          personal_trainer_id?: string | null
          plan_months?: number
          pt_end_date?: string | null
          pt_start_date?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"] | null
          trainer_fee?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_personal_trainer_id_fkey"
            columns: ["personal_trainer_id"]
            isOneToOne: false
            referencedRelation: "personal_trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_notifications: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          member_id: string
          notification_type: string
          sent_at: string
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          member_id: string
          notification_type: string
          sent_at?: string
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          member_id?: string
          notification_type?: string
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      refresh_subscription_statuses: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "member"
      payment_mode: "online" | "cash"
      payment_status: "pending" | "success" | "failed"
      subscription_status:
        | "active"
        | "expired"
        | "expiring_soon"
        | "paused"
        | "inactive"
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
      app_role: ["admin", "member"],
      payment_mode: ["online", "cash"],
      payment_status: ["pending", "success", "failed"],
      subscription_status: [
        "active",
        "expired",
        "expiring_soon",
        "paused",
        "inactive",
      ],
    },
  },
} as const

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
      admin_activity_logs: {
        Row: {
          activity_category: string
          activity_type: string
          admin_user_id: string | null
          branch_id: string | null
          created_at: string
          description: string
          entity_id: string | null
          entity_name: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          activity_category: string
          activity_type: string
          admin_user_id?: string | null
          branch_id?: string | null
          created_at?: string
          description: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          activity_category?: string
          activity_type?: string
          admin_user_id?: string | null
          branch_id?: string | null
          created_at?: string
          description?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_activity_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
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
      branches: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      custom_packages: {
        Row: {
          branch_id: string | null
          created_at: string
          duration_days: number
          id: string
          is_active: boolean
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          duration_days: number
          id?: string
          is_active?: boolean
          name: string
          price: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          duration_days?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_packages_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_pass_subscriptions: {
        Row: {
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
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
            foreignKeyName: "daily_pass_subscriptions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "daily_pass_users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_settings: {
        Row: {
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "gym_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount: number
          branch_id: string | null
          category: string
          created_at: string
          created_by: string | null
          daily_pass_user_id: string | null
          description: string
          entry_date: string
          entry_type: string
          id: string
          is_auto_generated: boolean
          member_id: string | null
          notes: string | null
          payment_id: string | null
          pt_subscription_id: string | null
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          branch_id?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          daily_pass_user_id?: string | null
          description: string
          entry_date?: string
          entry_type: string
          id?: string
          is_auto_generated?: boolean
          member_id?: string | null
          notes?: string | null
          payment_id?: string | null
          pt_subscription_id?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          daily_pass_user_id?: string | null
          description?: string
          entry_date?: string
          entry_type?: string
          id?: string
          is_auto_generated?: boolean
          member_id?: string | null
          notes?: string | null
          payment_id?: string | null
          pt_subscription_id?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_daily_pass_user_id_fkey"
            columns: ["daily_pass_user_id"]
            isOneToOne: false
            referencedRelation: "daily_pass_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_pt_subscription_id_fkey"
            columns: ["pt_subscription_id"]
            isOneToOne: false
            referencedRelation: "pt_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "personal_trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      member_details: {
        Row: {
          address: string | null
          created_at: string
          date_of_birth: string | null
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
          date_of_birth?: string | null
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
          date_of_birth?: string | null
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
          branch_id: string | null
          created_at: string | null
          email: string | null
          id: string
          join_date: string | null
          name: string
          phone: string
          updated_at: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          join_date?: string | null
          name: string
          phone: string
          updated_at?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          join_date?: string | null
          name?: string
          phone?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_packages: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          is_active: boolean
          joining_fee: number
          months: number
          price: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          joining_fee?: number
          months: number
          price: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          joining_fee?: number
          months?: number
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_packages_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
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
            foreignKeyName: "payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
          branch_id: string | null
          created_at: string
          id: string
          is_active: boolean
          monthly_fee: number
          monthly_salary: number
          name: string
          payment_category: string
          percentage_fee: number
          phone: string | null
          session_fee: number
          specialization: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_fee?: number
          monthly_salary?: number
          name: string
          payment_category?: string
          percentage_fee?: number
          phone?: string | null
          session_fee?: number
          specialization?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_fee?: number
          monthly_salary?: number
          name?: string
          payment_category?: string
          percentage_fee?: number
          phone?: string | null
          session_fee?: number
          specialization?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_trainers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      pt_subscriptions: {
        Row: {
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
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
            foreignKeyName: "pt_subscriptions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
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
            foreignKeyName: "subscriptions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
      user_activity_logs: {
        Row: {
          activity_type: string
          amount: number | null
          branch_id: string | null
          created_at: string
          daily_pass_user_id: string | null
          description: string
          duration_days: number | null
          duration_months: number | null
          end_date: string | null
          id: string
          member_id: string | null
          member_name: string | null
          member_phone: string | null
          metadata: Json | null
          package_name: string | null
          payment_id: string | null
          payment_mode: string | null
          pt_subscription_id: string | null
          start_date: string | null
          subscription_id: string | null
          trainer_id: string | null
          trainer_name: string | null
        }
        Insert: {
          activity_type: string
          amount?: number | null
          branch_id?: string | null
          created_at?: string
          daily_pass_user_id?: string | null
          description: string
          duration_days?: number | null
          duration_months?: number | null
          end_date?: string | null
          id?: string
          member_id?: string | null
          member_name?: string | null
          member_phone?: string | null
          metadata?: Json | null
          package_name?: string | null
          payment_id?: string | null
          payment_mode?: string | null
          pt_subscription_id?: string | null
          start_date?: string | null
          subscription_id?: string | null
          trainer_id?: string | null
          trainer_name?: string | null
        }
        Update: {
          activity_type?: string
          amount?: number | null
          branch_id?: string | null
          created_at?: string
          daily_pass_user_id?: string | null
          description?: string
          duration_days?: number | null
          duration_months?: number | null
          end_date?: string | null
          id?: string
          member_id?: string | null
          member_name?: string | null
          member_phone?: string | null
          metadata?: Json | null
          package_name?: string | null
          payment_id?: string | null
          payment_mode?: string | null
          pt_subscription_id?: string | null
          start_date?: string | null
          subscription_id?: string | null
          trainer_id?: string | null
          trainer_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_logs_daily_pass_user_id_fkey"
            columns: ["daily_pass_user_id"]
            isOneToOne: false
            referencedRelation: "daily_pass_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_logs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_logs_pt_subscription_id_fkey"
            columns: ["pt_subscription_id"]
            isOneToOne: false
            referencedRelation: "pt_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_logs_trainer_id_fkey"
            columns: ["trainer_id"]
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
          admin_user_id: string | null
          branch_id: string | null
          created_at: string
          daily_pass_user_id: string | null
          error_message: string | null
          id: string
          is_manual: boolean | null
          member_id: string
          message_content: string | null
          notification_type: string
          recipient_name: string | null
          recipient_phone: string | null
          sent_at: string
          status: string
        }
        Insert: {
          admin_user_id?: string | null
          branch_id?: string | null
          created_at?: string
          daily_pass_user_id?: string | null
          error_message?: string | null
          id?: string
          is_manual?: boolean | null
          member_id: string
          message_content?: string | null
          notification_type: string
          recipient_name?: string | null
          recipient_phone?: string | null
          sent_at?: string
          status?: string
        }
        Update: {
          admin_user_id?: string | null
          branch_id?: string | null
          created_at?: string
          daily_pass_user_id?: string | null
          error_message?: string | null
          id?: string
          is_manual?: boolean | null
          member_id?: string
          message_content?: string | null
          notification_type?: string
          recipient_name?: string | null
          recipient_phone?: string | null
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_notifications_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_notifications_daily_pass_user_id_fkey"
            columns: ["daily_pass_user_id"]
            isOneToOne: false
            referencedRelation: "daily_pass_users"
            referencedColumns: ["id"]
          },
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

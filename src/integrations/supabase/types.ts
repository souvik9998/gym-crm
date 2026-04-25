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
      attendance_devices: {
        Row: {
          branch_id: string
          created_at: string
          device_fingerprint: string
          id: string
          is_active: boolean
          member_id: string | null
          registered_at: string
          reset_at: string | null
          reset_by: string | null
          staff_id: string | null
          updated_at: string
          user_type: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          device_fingerprint: string
          id?: string
          is_active?: boolean
          member_id?: string | null
          registered_at?: string
          reset_at?: string | null
          reset_by?: string | null
          staff_id?: string | null
          updated_at?: string
          user_type: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          device_fingerprint?: string
          id?: string
          is_active?: boolean
          member_id?: string | null
          registered_at?: string
          reset_at?: string | null
          reset_by?: string | null
          staff_id?: string | null
          updated_at?: string
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_devices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_devices_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_devices_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_logs: {
        Row: {
          branch_id: string
          check_in_at: string
          check_out_at: string | null
          created_at: string
          date: string
          device_fingerprint: string | null
          id: string
          member_id: string | null
          staff_id: string | null
          status: string
          subscription_status: string | null
          total_hours: number | null
          updated_at: string
          user_type: string
        }
        Insert: {
          branch_id: string
          check_in_at?: string
          check_out_at?: string | null
          created_at?: string
          date?: string
          device_fingerprint?: string | null
          id?: string
          member_id?: string | null
          staff_id?: string | null
          status?: string
          subscription_status?: string | null
          total_hours?: number | null
          updated_at?: string
          user_type: string
        }
        Update: {
          branch_id?: string
          check_in_at?: string
          check_out_at?: string | null
          created_at?: string
          date?: string
          device_fingerprint?: string | null
          id?: string
          member_id?: string | null
          staff_id?: string | null
          status?: string
          subscription_status?: string | null
          total_hours?: number | null
          updated_at?: string
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      biometric_devices: {
        Row: {
          api_key: string
          branch_id: string
          created_at: string
          device_brand: string
          device_ip: string | null
          device_name: string
          device_port: number | null
          device_serial: string
          id: string
          is_active: boolean
          is_sync_enabled: boolean
          last_sync_at: string | null
          total_logs_received: number
          updated_at: string
        }
        Insert: {
          api_key?: string
          branch_id: string
          created_at?: string
          device_brand?: string
          device_ip?: string | null
          device_name: string
          device_port?: number | null
          device_serial: string
          id?: string
          is_active?: boolean
          is_sync_enabled?: boolean
          last_sync_at?: string | null
          total_logs_received?: number
          updated_at?: string
        }
        Update: {
          api_key?: string
          branch_id?: string
          created_at?: string
          device_brand?: string
          device_ip?: string | null
          device_name?: string
          device_port?: number | null
          device_serial?: string
          id?: string
          is_active?: boolean
          is_sync_enabled?: boolean
          last_sync_at?: string | null
          total_logs_received?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "biometric_devices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      biometric_enrollment_requests: {
        Row: {
          biometric_user_id: string | null
          branch_id: string
          created_at: string
          device_id: string
          enrollment_type: string
          error_message: string | null
          expires_at: string
          id: string
          member_id: string
          requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          biometric_user_id?: string | null
          branch_id: string
          created_at?: string
          device_id: string
          enrollment_type?: string
          error_message?: string | null
          expires_at?: string
          id?: string
          member_id: string
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          biometric_user_id?: string | null
          branch_id?: string
          created_at?: string
          device_id?: string
          enrollment_type?: string
          error_message?: string | null
          expires_at?: string
          id?: string
          member_id?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "biometric_enrollment_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "biometric_enrollment_requests_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "biometric_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "biometric_enrollment_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      biometric_member_mappings: {
        Row: {
          biometric_user_id: string
          biometric_user_name: string | null
          branch_id: string
          created_at: string
          id: string
          is_mapped: boolean
          member_id: string | null
          updated_at: string
        }
        Insert: {
          biometric_user_id: string
          biometric_user_name?: string | null
          branch_id: string
          created_at?: string
          id?: string
          is_mapped?: boolean
          member_id?: string | null
          updated_at?: string
        }
        Update: {
          biometric_user_id?: string
          biometric_user_name?: string | null
          branch_id?: string
          created_at?: string
          id?: string
          is_mapped?: boolean
          member_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "biometric_member_mappings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "biometric_member_mappings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      biometric_sync_logs: {
        Row: {
          branch_id: string
          device_id: string
          error_message: string | null
          id: string
          logs_duplicated: number
          logs_processed: number
          logs_received: number
          logs_unmapped: number
          sync_status: string
          synced_at: string
        }
        Insert: {
          branch_id: string
          device_id: string
          error_message?: string | null
          id?: string
          logs_duplicated?: number
          logs_processed?: number
          logs_received?: number
          logs_unmapped?: number
          sync_status?: string
          synced_at?: string
        }
        Update: {
          branch_id?: string
          device_id?: string
          error_message?: string | null
          id?: string
          logs_duplicated?: number
          logs_processed?: number
          logs_received?: number
          logs_unmapped?: number
          sync_status?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "biometric_sync_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "biometric_sync_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "biometric_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean
          is_default: boolean
          logo_url: string | null
          name: string
          phone: string | null
          slug: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          logo_url?: string | null
          name: string
          phone?: string | null
          slug: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          slug?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_usage: {
        Row: {
          branch_id: string | null
          coupon_id: string
          discount_applied: number
          id: string
          member_id: string | null
          payment_id: string | null
          used_at: string
        }
        Insert: {
          branch_id?: string | null
          coupon_id: string
          discount_applied?: number
          id?: string
          member_id?: string | null
          payment_id?: string | null
          used_at?: string
        }
        Update: {
          branch_id?: string | null
          coupon_id?: string
          discount_applied?: number
          id?: string
          member_id?: string | null
          payment_id?: string | null
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usage_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          applicable_branch_ids: string[] | null
          applicable_on: Json
          applicable_plan_ids: string[] | null
          auto_apply: boolean
          branch_id: string | null
          code: string
          created_at: string
          created_by: string | null
          discount_type: string
          discount_value: number
          end_date: string | null
          existing_members_only: boolean
          expired_members_only: boolean
          first_time_only: boolean
          id: string
          is_active: boolean
          max_discount_cap: number | null
          min_order_value: number | null
          notes: string | null
          per_user_limit: number
          specific_member_ids: string[] | null
          stackable: boolean
          start_date: string
          tenant_id: string | null
          total_usage_limit: number | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          applicable_branch_ids?: string[] | null
          applicable_on?: Json
          applicable_plan_ids?: string[] | null
          auto_apply?: boolean
          branch_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          discount_type?: string
          discount_value?: number
          end_date?: string | null
          existing_members_only?: boolean
          expired_members_only?: boolean
          first_time_only?: boolean
          id?: string
          is_active?: boolean
          max_discount_cap?: number | null
          min_order_value?: number | null
          notes?: string | null
          per_user_limit?: number
          specific_member_ids?: string[] | null
          stackable?: boolean
          start_date?: string
          tenant_id?: string | null
          total_usage_limit?: number | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          applicable_branch_ids?: string[] | null
          applicable_on?: Json
          applicable_plan_ids?: string[] | null
          auto_apply?: boolean
          branch_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          discount_type?: string
          discount_value?: number
          end_date?: string | null
          existing_members_only?: boolean
          expired_members_only?: boolean
          first_time_only?: boolean
          id?: string
          is_active?: boolean
          max_discount_cap?: number | null
          min_order_value?: number | null
          notes?: string | null
          per_user_limit?: number
          specific_member_ids?: string[] | null
          stackable?: boolean
          start_date?: string
          tenant_id?: string | null
          total_usage_limit?: number | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      daily_attendance: {
        Row: {
          branch_id: string
          created_at: string
          date: string
          id: string
          marked_by: string | null
          marked_by_type: string | null
          member_id: string | null
          notes: string | null
          staff_id: string | null
          status: string
          time_slot_id: string | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          date?: string
          id?: string
          marked_by?: string | null
          marked_by_type?: string | null
          member_id?: string | null
          notes?: string | null
          staff_id?: string | null
          status?: string
          time_slot_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          date?: string
          id?: string
          marked_by?: string | null
          marked_by_type?: string | null
          member_id?: string | null
          notes?: string | null
          staff_id?: string | null
          status?: string
          time_slot_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendance_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_time_slot_id_fkey"
            columns: ["time_slot_id"]
            isOneToOne: false
            referencedRelation: "trainer_time_slots"
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
      event_custom_fields: {
        Row: {
          created_at: string
          event_id: string
          field_name: string
          field_type: string
          id: string
          is_required: boolean
          options: Json | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          event_id: string
          field_name: string
          field_type?: string
          id?: string
          is_required?: boolean
          options?: Json | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          event_id?: string
          field_name?: string
          field_type?: string
          id?: string
          is_required?: boolean
          options?: Json | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_custom_fields_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_pricing_options: {
        Row: {
          capacity_limit: number | null
          created_at: string
          description: string | null
          event_id: string
          id: string
          is_active: boolean
          name: string
          price: number
          slots_filled: number
          sort_order: number
        }
        Insert: {
          capacity_limit?: number | null
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          is_active?: boolean
          name: string
          price?: number
          slots_filled?: number
          sort_order?: number
        }
        Update: {
          capacity_limit?: number | null
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          slots_filled?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_pricing_options_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registration_items: {
        Row: {
          amount_paid: number
          created_at: string
          id: string
          pricing_option_id: string
          registration_id: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          id?: string
          pricing_option_id: string
          registration_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          id?: string
          pricing_option_id?: string
          registration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registration_items_pricing_option_id_fkey"
            columns: ["pricing_option_id"]
            isOneToOne: false
            referencedRelation: "event_pricing_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registration_items_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "event_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          amount_paid: number
          created_at: string
          custom_field_responses: Json | null
          email: string | null
          event_id: string
          id: string
          member_id: string | null
          name: string
          payment_id: string | null
          payment_status: string
          phone: string
          pricing_option_id: string | null
          registered_at: string
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          custom_field_responses?: Json | null
          email?: string | null
          event_id: string
          id?: string
          member_id?: string | null
          name: string
          payment_id?: string | null
          payment_status?: string
          phone: string
          pricing_option_id?: string | null
          registered_at?: string
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          custom_field_responses?: Json | null
          email?: string | null
          event_id?: string
          id?: string
          member_id?: string | null
          name?: string
          payment_id?: string | null
          payment_status?: string
          phone?: string
          pricing_option_id?: string | null
          registered_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_pricing_option_id_fkey"
            columns: ["pricing_option_id"]
            isOneToOne: false
            referencedRelation: "event_pricing_options"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          banner_image_url: string | null
          branch_id: string
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string
          event_end_date: string | null
          id: string
          location: string | null
          selection_mode: string
          slug: string
          status: string
          title: string
          updated_at: string
          whatsapp_notify_on_register: boolean
        }
        Insert: {
          banner_image_url?: string | null
          branch_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date: string
          event_end_date?: string | null
          id?: string
          location?: string | null
          selection_mode?: string
          slug: string
          status?: string
          title: string
          updated_at?: string
          whatsapp_notify_on_register?: boolean
        }
        Update: {
          banner_image_url?: string | null
          branch_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          event_end_date?: string | null
          id?: string
          location?: string | null
          selection_mode?: string
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          whatsapp_notify_on_register?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_holidays: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          description: string | null
          half_day_end_time: string | null
          half_day_start_time: string | null
          holiday_date: string
          holiday_name: string
          holiday_type: string
          id: string
          notify_members: boolean
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          half_day_end_time?: string | null
          half_day_start_time?: string | null
          holiday_date: string
          holiday_name: string
          holiday_type?: string
          id?: string
          notify_members?: boolean
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          half_day_end_time?: string | null
          half_day_start_time?: string | null
          holiday_date?: string
          holiday_name?: string
          holiday_type?: string
          id?: string
          notify_members?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_holidays_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_settings: {
        Row: {
          assessment_field_settings: Json
          branch_id: string | null
          gym_address: string | null
          gym_email: string | null
          gym_gst: string | null
          gym_name: string | null
          gym_phone: string | null
          id: string
          invoice_brand_name: string | null
          invoice_footer_message: string | null
          invoice_logo_url: string | null
          invoice_palette: Json
          invoice_prefix: string
          invoice_show_gst: boolean
          invoice_tax_rate: number
          invoice_terms: string | null
          joining_fee: number
          monthly_fee: number
          monthly_packages: number[] | null
          registration_field_settings: Json
          time_buckets: Json
          updated_at: string | null
          whatsapp_auto_send: Json
          whatsapp_enabled: boolean | null
        }
        Insert: {
          assessment_field_settings?: Json
          branch_id?: string | null
          gym_address?: string | null
          gym_email?: string | null
          gym_gst?: string | null
          gym_name?: string | null
          gym_phone?: string | null
          id?: string
          invoice_brand_name?: string | null
          invoice_footer_message?: string | null
          invoice_logo_url?: string | null
          invoice_palette?: Json
          invoice_prefix?: string
          invoice_show_gst?: boolean
          invoice_tax_rate?: number
          invoice_terms?: string | null
          joining_fee?: number
          monthly_fee?: number
          monthly_packages?: number[] | null
          registration_field_settings?: Json
          time_buckets?: Json
          updated_at?: string | null
          whatsapp_auto_send?: Json
          whatsapp_enabled?: boolean | null
        }
        Update: {
          assessment_field_settings?: Json
          branch_id?: string | null
          gym_address?: string | null
          gym_email?: string | null
          gym_gst?: string | null
          gym_name?: string | null
          gym_phone?: string | null
          id?: string
          invoice_brand_name?: string | null
          invoice_footer_message?: string | null
          invoice_logo_url?: string | null
          invoice_palette?: Json
          invoice_prefix?: string
          invoice_show_gst?: boolean
          invoice_tax_rate?: number
          invoice_terms?: string | null
          joining_fee?: number
          monthly_fee?: number
          monthly_packages?: number[] | null
          registration_field_settings?: Json
          time_buckets?: Json
          updated_at?: string | null
          whatsapp_auto_send?: Json
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
      invoices: {
        Row: {
          amount: number
          branch_id: string | null
          branch_name: string | null
          created_at: string
          customer_name: string
          customer_phone: string | null
          daily_pass_user_id: string | null
          discount: number
          end_date: string | null
          footer_message: string | null
          gym_address: string | null
          gym_email: string | null
          gym_fee: number
          gym_gst: string | null
          gym_name: string
          gym_phone: string | null
          id: string
          invoice_brand_name: string | null
          invoice_logo_url: string | null
          invoice_number: string
          invoice_palette: Json
          joining_fee: number
          member_id: string | null
          package_name: string | null
          payment_date: string | null
          payment_id: string | null
          payment_mode: string | null
          pdf_url: string | null
          start_date: string | null
          subtotal: number
          tax: number
          trainer_fee: number
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          branch_id?: string | null
          branch_name?: string | null
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          daily_pass_user_id?: string | null
          discount?: number
          end_date?: string | null
          footer_message?: string | null
          gym_address?: string | null
          gym_email?: string | null
          gym_fee?: number
          gym_gst?: string | null
          gym_name: string
          gym_phone?: string | null
          id?: string
          invoice_brand_name?: string | null
          invoice_logo_url?: string | null
          invoice_number: string
          invoice_palette?: Json
          joining_fee?: number
          member_id?: string | null
          package_name?: string | null
          payment_date?: string | null
          payment_id?: string | null
          payment_mode?: string | null
          pdf_url?: string | null
          start_date?: string | null
          subtotal?: number
          tax?: number
          trainer_fee?: number
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          branch_name?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          daily_pass_user_id?: string | null
          discount?: number
          end_date?: string | null
          footer_message?: string | null
          gym_address?: string | null
          gym_email?: string | null
          gym_fee?: number
          gym_gst?: string | null
          gym_name?: string
          gym_phone?: string | null
          id?: string
          invoice_brand_name?: string | null
          invoice_logo_url?: string | null
          invoice_number?: string
          invoice_palette?: Json
          joining_fee?: number
          member_id?: string | null
          package_name?: string | null
          payment_date?: string | null
          payment_id?: string | null
          payment_mode?: string | null
          pdf_url?: string | null
          start_date?: string | null
          subtotal?: number
          tax?: number
          trainer_fee?: number
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_daily_pass_user_id_fkey"
            columns: ["daily_pass_user_id"]
            isOneToOne: false
            referencedRelation: "daily_pass_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
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
      member_assessments: {
        Row: {
          allowed_exercises: string | null
          assessed_by: string
          assessment_data: Json | null
          assessment_date: string
          branch_id: string
          created_at: string
          current_condition: string | null
          id: string
          injuries_health_issues: string | null
          is_draft: boolean
          member_id: string
          mobility_limitations: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          allowed_exercises?: string | null
          assessed_by?: string
          assessment_data?: Json | null
          assessment_date?: string
          branch_id: string
          created_at?: string
          current_condition?: string | null
          id?: string
          injuries_health_issues?: string | null
          is_draft?: boolean
          member_id: string
          mobility_limitations?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          allowed_exercises?: string | null
          assessed_by?: string
          assessment_data?: Json | null
          assessment_date?: string
          branch_id?: string
          created_at?: string
          current_condition?: string | null
          id?: string
          injuries_health_issues?: string | null
          is_draft?: boolean
          member_id?: string
          mobility_limitations?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_assessments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_assessments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_details: {
        Row: {
          address: string | null
          allergies: string | null
          blood_group: string | null
          created_at: string
          date_of_birth: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          gender: string | null
          height_cm: number | null
          id: string
          medical_conditions: string | null
          member_id: string
          personal_trainer_id: string | null
          photo_id_number: string | null
          photo_id_type: string | null
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          address?: string | null
          allergies?: string | null
          blood_group?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: string | null
          height_cm?: number | null
          id?: string
          medical_conditions?: string | null
          member_id: string
          personal_trainer_id?: string | null
          photo_id_number?: string | null
          photo_id_type?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          address?: string | null
          allergies?: string | null
          blood_group?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: string | null
          height_cm?: number | null
          id?: string
          medical_conditions?: string | null
          member_id?: string
          personal_trainer_id?: string | null
          photo_id_number?: string | null
          photo_id_type?: string | null
          updated_at?: string
          weight_kg?: number | null
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
      member_documents: {
        Row: {
          created_at: string
          document_type: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          member_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_type: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          member_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          member_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_documents_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_exercise_items: {
        Row: {
          created_at: string
          exercise_name: string
          id: string
          notes: string | null
          plan_id: string
          reps: string
          sets: number
          sort_order: number
          weight_unit: string | null
          weight_value: number | null
        }
        Insert: {
          created_at?: string
          exercise_name: string
          id?: string
          notes?: string | null
          plan_id: string
          reps?: string
          sets?: number
          sort_order?: number
          weight_unit?: string | null
          weight_value?: number | null
        }
        Update: {
          created_at?: string
          exercise_name?: string
          id?: string
          notes?: string | null
          plan_id?: string
          reps?: string
          sets?: number
          sort_order?: number
          weight_unit?: string | null
          weight_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "member_exercise_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "member_exercise_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      member_exercise_plans: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string
          goal: string
          id: string
          is_active: boolean
          member_id: string
          plan_name: string
          updated_at: string
          workout_split: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string
          goal?: string
          id?: string
          is_active?: boolean
          member_id: string
          plan_name: string
          updated_at?: string
          workout_split?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string
          goal?: string
          id?: string
          is_active?: boolean
          member_id?: string
          plan_name?: string
          updated_at?: string
          workout_split?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_exercise_plans_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_exercise_plans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          branch_id: string
          created_at: string | null
          email: string | null
          id: string
          join_date: string | null
          name: string
          phone: string
          updated_at: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          email?: string | null
          id?: string
          join_date?: string | null
          name: string
          phone: string
          updated_at?: string | null
        }
        Update: {
          branch_id?: string
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
      platform_audit_logs: {
        Row: {
          action_type: string
          actor_user_id: string | null
          created_at: string
          description: string
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          target_tenant_id: string | null
          target_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          action_type: string
          actor_user_id?: string | null
          created_at?: string
          description: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          target_tenant_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          actor_user_id?: string | null
          created_at?: string
          description?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          target_tenant_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_logs_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          allow_new_signups: boolean
          created_at: string
          default_branch_limit: number
          default_member_limit: number
          default_monthly_checkins: number
          default_staff_per_branch: number
          default_storage_mb: number
          default_trainers_limit: number
          default_whatsapp_limit: number
          id: string
          maintenance_mode: boolean
          updated_at: string
        }
        Insert: {
          allow_new_signups?: boolean
          created_at?: string
          default_branch_limit?: number
          default_member_limit?: number
          default_monthly_checkins?: number
          default_staff_per_branch?: number
          default_storage_mb?: number
          default_trainers_limit?: number
          default_whatsapp_limit?: number
          id?: string
          maintenance_mode?: boolean
          updated_at?: string
        }
        Update: {
          allow_new_signups?: boolean
          created_at?: string
          default_branch_limit?: number
          default_member_limit?: number
          default_monthly_checkins?: number
          default_staff_per_branch?: number
          default_storage_mb?: number
          default_trainers_limit?: number
          default_whatsapp_limit?: number
          id?: string
          maintenance_mode?: boolean
          updated_at?: string
        }
        Relationships: []
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
          time_slot_id: string | null
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
          time_slot_id?: string | null
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
          time_slot_id?: string | null
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
          {
            foreignKeyName: "pt_subscriptions_time_slot_id_fkey"
            columns: ["time_slot_id"]
            isOneToOne: false
            referencedRelation: "trainer_time_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      razorpay_credentials: {
        Row: {
          created_at: string
          created_by: string | null
          encrypted_key_secret: string
          encryption_iv: string
          id: string
          is_verified: boolean
          key_id: string
          tenant_id: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          encrypted_key_secret: string
          encryption_iv: string
          id?: string
          is_verified?: boolean
          key_id: string
          tenant_id: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          encrypted_key_secret?: string
          encryption_iv?: string
          id?: string
          is_verified?: boolean
          key_id?: string
          tenant_id?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "razorpay_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_schedules: {
        Row: {
          branch_id: string
          created_at: string
          frequency: string
          id: string
          include_attendance: boolean
          include_branch_analysis: boolean
          include_memberships: boolean
          include_payments: boolean
          include_trainers: boolean
          is_enabled: boolean
          last_sent_at: string | null
          next_run_at: string | null
          report_email: string | null
          report_format: string
          send_whatsapp: boolean
          updated_at: string
          whatsapp_phone: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          frequency?: string
          id?: string
          include_attendance?: boolean
          include_branch_analysis?: boolean
          include_memberships?: boolean
          include_payments?: boolean
          include_trainers?: boolean
          is_enabled?: boolean
          last_sent_at?: string | null
          next_run_at?: string | null
          report_email?: string | null
          report_format?: string
          send_whatsapp?: boolean
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          frequency?: string
          id?: string
          include_attendance?: boolean
          include_branch_analysis?: boolean
          include_memberships?: boolean
          include_payments?: boolean
          include_trainers?: boolean
          is_enabled?: boolean
          last_sent_at?: string | null
          next_run_at?: string | null
          report_email?: string | null
          report_format?: string
          send_whatsapp?: boolean
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_schedules_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          auth_user_id: string | null
          created_at: string
          created_by: string | null
          failed_login_attempts: number
          full_name: string
          id: string
          id_number: string | null
          id_type: string | null
          is_active: boolean
          last_login_at: string | null
          last_login_ip: string | null
          locked_until: string | null
          monthly_salary: number | null
          password_hash: string | null
          password_set_at: string | null
          percentage_fee: number | null
          phone: string
          role: Database["public"]["Enums"]["staff_role"]
          salary_type: Database["public"]["Enums"]["salary_type"]
          session_fee: number | null
          specialization: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          created_by?: string | null
          failed_login_attempts?: number
          full_name: string
          id?: string
          id_number?: string | null
          id_type?: string | null
          is_active?: boolean
          last_login_at?: string | null
          last_login_ip?: string | null
          locked_until?: string | null
          monthly_salary?: number | null
          password_hash?: string | null
          password_set_at?: string | null
          percentage_fee?: number | null
          phone: string
          role: Database["public"]["Enums"]["staff_role"]
          salary_type?: Database["public"]["Enums"]["salary_type"]
          session_fee?: number | null
          specialization?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          created_by?: string | null
          failed_login_attempts?: number
          full_name?: string
          id?: string
          id_number?: string | null
          id_type?: string | null
          is_active?: boolean
          last_login_at?: string | null
          last_login_ip?: string | null
          locked_until?: string | null
          monthly_salary?: number | null
          password_hash?: string | null
          password_set_at?: string | null
          percentage_fee?: number | null
          phone?: string
          role?: Database["public"]["Enums"]["staff_role"]
          salary_type?: Database["public"]["Enums"]["salary_type"]
          session_fee?: number | null
          specialization?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      staff_branch_assignments: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_primary: boolean
          staff_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          staff_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_branch_assignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_branch_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_login_attempts: {
        Row: {
          created_at: string
          failure_reason: string | null
          id: string
          ip_address: string | null
          phone: string
          success: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          phone: string
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          phone?: string
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      staff_permissions: {
        Row: {
          can_access_analytics: boolean
          can_access_attendance: boolean
          can_access_ledger: boolean
          can_access_payments: boolean
          can_assign_members_to_slots: boolean
          can_change_settings: boolean
          can_create_time_slots: boolean
          can_edit_delete_time_slots: boolean
          can_manage_events: boolean
          can_manage_members: boolean
          can_manage_time_slots: boolean
          can_send_whatsapp: boolean
          can_view_members: boolean
          can_view_settings: boolean
          can_view_slot_members: boolean
          can_view_time_slots: boolean
          created_at: string
          id: string
          member_access_type: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          can_access_analytics?: boolean
          can_access_attendance?: boolean
          can_access_ledger?: boolean
          can_access_payments?: boolean
          can_assign_members_to_slots?: boolean
          can_change_settings?: boolean
          can_create_time_slots?: boolean
          can_edit_delete_time_slots?: boolean
          can_manage_events?: boolean
          can_manage_members?: boolean
          can_manage_time_slots?: boolean
          can_send_whatsapp?: boolean
          can_view_members?: boolean
          can_view_settings?: boolean
          can_view_slot_members?: boolean
          can_view_time_slots?: boolean
          created_at?: string
          id?: string
          member_access_type?: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          can_access_analytics?: boolean
          can_access_attendance?: boolean
          can_access_ledger?: boolean
          can_access_payments?: boolean
          can_assign_members_to_slots?: boolean
          can_change_settings?: boolean
          can_create_time_slots?: boolean
          can_edit_delete_time_slots?: boolean
          can_manage_events?: boolean
          can_manage_members?: boolean
          can_manage_time_slots?: boolean
          can_send_whatsapp?: boolean
          can_view_members?: boolean
          can_view_settings?: boolean
          can_view_slot_members?: boolean
          can_view_time_slots?: boolean
          created_at?: string
          id?: string
          member_access_type?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_permissions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          ip_address: string | null
          is_revoked: boolean
          session_token: string
          staff_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          ip_address?: string | null
          is_revoked?: boolean
          session_token: string
          staff_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          is_revoked?: boolean
          session_token?: string
          staff_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_sessions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
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
      tenant_billing_info: {
        Row: {
          billing_address: Json | null
          billing_cycle: string | null
          billing_email: string | null
          billing_name: string | null
          created_at: string
          current_plan_name: string | null
          external_customer_id: string | null
          external_subscription_id: string | null
          id: string
          next_billing_date: string | null
          tax_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          billing_address?: Json | null
          billing_cycle?: string | null
          billing_email?: string | null
          billing_name?: string | null
          created_at?: string
          current_plan_name?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          next_billing_date?: string | null
          tax_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          billing_address?: Json | null
          billing_cycle?: string | null
          billing_email?: string | null
          billing_name?: string | null
          created_at?: string
          current_plan_name?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          next_billing_date?: string | null
          tax_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_billing_info_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          branch_id: string | null
          created_at: string
          hostname: string
          id: string
          is_primary: boolean
          is_verified: boolean
          notes: string | null
          tenant_id: string
          updated_at: string
          verification_token: string
          verified_at: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          hostname: string
          id?: string
          is_primary?: boolean
          is_verified?: boolean
          notes?: string | null
          tenant_id: string
          updated_at?: string
          verification_token?: string
          verified_at?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          hostname?: string
          id?: string
          is_primary?: boolean
          is_verified?: boolean
          notes?: string | null
          tenant_id?: string
          updated_at?: string
          verification_token?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_limits: {
        Row: {
          created_at: string
          features: Json
          id: string
          max_branches: number
          max_members: number
          max_monthly_checkins: number
          max_monthly_whatsapp_messages: number
          max_staff_per_branch: number
          max_storage_mb: number
          max_trainers: number
          plan_expiry_date: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          features?: Json
          id?: string
          max_branches?: number
          max_members?: number
          max_monthly_checkins?: number
          max_monthly_whatsapp_messages?: number
          max_staff_per_branch?: number
          max_storage_mb?: number
          max_trainers?: number
          plan_expiry_date?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          features?: Json
          id?: string
          max_branches?: number
          max_members?: number
          max_monthly_checkins?: number
          max_monthly_whatsapp_messages?: number
          max_staff_per_branch?: number
          max_storage_mb?: number
          max_trainers?: number
          plan_expiry_date?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_limits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          is_owner: boolean
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_owner?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_owner?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_usage: {
        Row: {
          branches_count: number
          created_at: string
          id: string
          members_count: number
          period_end: string
          period_start: string
          staff_count: number
          tenant_id: string
          total_revenue: number
          trainers_count: number
          updated_at: string
          whatsapp_messages_sent: number
        }
        Insert: {
          branches_count?: number
          created_at?: string
          id?: string
          members_count?: number
          period_end: string
          period_start: string
          staff_count?: number
          tenant_id: string
          total_revenue?: number
          trainers_count?: number
          updated_at?: string
          whatsapp_messages_sent?: number
        }
        Update: {
          branches_count?: number
          created_at?: string
          id?: string
          members_count?: number
          period_end?: string
          period_start?: string
          staff_count?: number
          tenant_id?: string
          total_revenue?: number
          trainers_count?: number
          updated_at?: string
          whatsapp_messages_sent?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          phone: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          phone?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      time_slot_members: {
        Row: {
          assigned_by: string | null
          branch_id: string
          created_at: string
          id: string
          member_id: string
          time_slot_id: string
        }
        Insert: {
          assigned_by?: string | null
          branch_id: string
          created_at?: string
          id?: string
          member_id: string
          time_slot_id: string
        }
        Update: {
          assigned_by?: string | null
          branch_id?: string
          created_at?: string
          id?: string
          member_id?: string
          time_slot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_slot_members_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_slot_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_slot_members_time_slot_id_fkey"
            columns: ["time_slot_id"]
            isOneToOne: false
            referencedRelation: "trainer_time_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_time_slots: {
        Row: {
          branch_id: string
          capacity: number
          created_at: string
          end_time: string
          id: string
          is_recurring: boolean
          recurring_days: number[] | null
          start_time: string
          status: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          capacity?: number
          created_at?: string
          end_time: string
          id?: string
          is_recurring?: boolean
          recurring_days?: number[] | null
          start_time: string
          status?: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          capacity?: number
          created_at?: string
          end_time?: string
          id?: string
          is_recurring?: boolean
          recurring_days?: number[] | null
          start_time?: string
          status?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_time_slots_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_time_slots_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "staff"
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
          member_id: string | null
          message_content: string | null
          notification_type: string
          recipient_name: string | null
          recipient_phone: string | null
          sent_at: string
          status: string
          subscription_id: string | null
        }
        Insert: {
          admin_user_id?: string | null
          branch_id?: string | null
          created_at?: string
          daily_pass_user_id?: string | null
          error_message?: string | null
          id?: string
          is_manual?: boolean | null
          member_id?: string | null
          message_content?: string | null
          notification_type: string
          recipient_name?: string | null
          recipient_phone?: string | null
          sent_at?: string
          status?: string
          subscription_id?: string | null
        }
        Update: {
          admin_user_id?: string | null
          branch_id?: string | null
          created_at?: string
          daily_pass_user_id?: string | null
          error_message?: string | null
          id?: string
          is_manual?: boolean | null
          member_id?: string | null
          message_content?: string | null
          notification_type?: string
          recipient_name?: string | null
          recipient_phone?: string | null
          sent_at?: string
          status?: string
          subscription_id?: string | null
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
          {
            foreignKeyName: "whatsapp_notifications_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      branch_purge:
        | { Args: { _branch_id: string }; Returns: undefined }
        | {
            Args: { _branch_id: string; _caller_id?: string }
            Returns: undefined
          }
      branch_restore_tx:
        | { Args: { _branch_id: string; _payload: Json }; Returns: Json }
        | {
            Args: { _branch_id: string; _caller_id?: string; _payload: Json }
            Returns: Json
          }
      check_phone_exists: {
        Args: { p_branch_id?: string; phone_number: string }
        Returns: {
          has_active_subscription: boolean
          member_email: string
          member_exists: boolean
          member_id: string
          member_name: string
          member_phone: string
        }[]
      }
      generate_invoice_number: { Args: { _branch_id: string }; Returns: string }
      generate_slug: { Args: { input_text: string }; Returns: string }
      get_dashboard_stats: {
        Args: { _branch_id?: string }
        Returns: {
          active_members: number
          daily_pass_users: number
          expired_members: number
          expiring_soon: number
          inactive_members: number
          monthly_revenue: number
          total_members: number
          with_pt: number
        }[]
      }
      get_member_subscription_info: {
        Args: { p_member_id: string }
        Returns: {
          end_date: string
          start_date: string
          status: string
          subscription_id: string
        }[]
      }
      get_staff_id: { Args: { _user_id: string }; Returns: string }
      get_staff_id_from_session: { Args: never; Returns: string }
      get_staff_names_for_branch: {
        Args: { _branch_id: string }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_tenant_current_usage: {
        Args: { _tenant_id: string }
        Returns: {
          branches_count: number
          members_count: number
          monthly_checkins: number
          staff_count: number
          trainers_count: number
          whatsapp_this_month: number
        }[]
      }
      get_tenant_from_branch: { Args: { _branch_id: string }; Returns: string }
      get_tenant_permissions: { Args: { _tenant_id: string }; Returns: Json }
      get_tenant_storage_usage_mb: {
        Args: { _tenant_id: string }
        Returns: number
      }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_whatsapp_usage: {
        Args: { _count?: number; _tenant_id: string }
        Returns: boolean
      }
      is_gym_owner: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_admin: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      refresh_subscription_statuses: { Args: never; Returns: undefined }
      resolve_tenant_by_hostname: {
        Args: { _hostname: string }
        Returns: {
          branch_id: string
          branch_logo_url: string
          branch_name: string
          branch_slug: string
          is_verified: boolean
          tenant_id: string
          tenant_name: string
        }[]
      }
      staff_has_permission: {
        Args: { _permission: string; _staff_id: string }
        Returns: boolean
      }
      tenant_can_add_resource: {
        Args: { _resource_type: string; _tenant_id: string }
        Returns: boolean
      }
      user_belongs_to_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "member" | "staff" | "super_admin" | "tenant_admin"
      payment_mode: "online" | "cash" | "upi"
      payment_status: "pending" | "success" | "failed"
      salary_type: "monthly" | "session_based" | "percentage" | "both"
      staff_role: "manager" | "trainer" | "reception" | "accountant"
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
      app_role: ["admin", "member", "staff", "super_admin", "tenant_admin"],
      payment_mode: ["online", "cash", "upi"],
      payment_status: ["pending", "success", "failed"],
      salary_type: ["monthly", "session_based", "percentage", "both"],
      staff_role: ["manager", "trainer", "reception", "accountant"],
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

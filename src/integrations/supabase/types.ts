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
      checklist_template_items: {
        Row: {
          created_at: string
          id: string
          item_order: number
          kb_article_id: string | null
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_order?: number
          kb_article_id?: string | null
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          item_order?: number
          kb_article_id?: string | null
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_kb_article_id_fkey"
            columns: ["kb_article_id"]
            isOneToOne: false
            referencedRelation: "kb_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_sectors: {
        Row: {
          client_id: string
          created_at: string
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_sectors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          address_complement: string | null
          address_number: string | null
          city: string | null
          created_at: string
          email: string | null
          email_domain: string | null
          full_name: string
          id: string
          neighborhood: string | null
          parent_client_id: string | null
          phone: string | null
          updated_at: string
          whatsapp_group_id: string | null
        }
        Insert: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          email_domain?: string | null
          full_name: string
          id?: string
          neighborhood?: string | null
          parent_client_id?: string | null
          phone?: string | null
          updated_at?: string
          whatsapp_group_id?: string | null
        }
        Update: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          email_domain?: string | null
          full_name?: string
          id?: string
          neighborhood?: string | null
          parent_client_id?: string | null
          phone?: string | null
          updated_at?: string
          whatsapp_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_parent_client_id_fkey"
            columns: ["parent_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_disks: {
        Row: {
          disk_free_gb: number | null
          disk_total_gb: number | null
          disk_used_gb: number | null
          drive_letter: string | null
          equipment_id: string
          file_system: string | null
          id: string
          label: string | null
          updated_at: string
        }
        Insert: {
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_used_gb?: number | null
          drive_letter?: string | null
          equipment_id: string
          file_system?: string | null
          id?: string
          label?: string | null
          updated_at?: string
        }
        Update: {
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_used_gb?: number | null
          drive_letter?: string | null
          equipment_id?: string
          file_system?: string | null
          id?: string
          label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_disks_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_inventory: {
        Row: {
          asset_tag: string | null
          brand: string | null
          client_id: string | null
          cpu: string | null
          created_at: string
          disk_free_gb: number | null
          disk_total_gb: number | null
          disk_used_gb: number | null
          equipment_type_id: string | null
          hardware_updated_at: string | null
          id: string
          location: string | null
          logged_in_user: string | null
          model: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          ram_total_gb: number | null
          sector_id: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["equipment_status"]
          updated_at: string
          warranty_until: string | null
        }
        Insert: {
          asset_tag?: string | null
          brand?: string | null
          client_id?: string | null
          cpu?: string | null
          created_at?: string
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_used_gb?: number | null
          equipment_type_id?: string | null
          hardware_updated_at?: string | null
          id?: string
          location?: string | null
          logged_in_user?: string | null
          model?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          ram_total_gb?: number | null
          sector_id?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string
          warranty_until?: string | null
        }
        Update: {
          asset_tag?: string | null
          brand?: string | null
          client_id?: string | null
          cpu?: string | null
          created_at?: string
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_used_gb?: number | null
          equipment_type_id?: string | null
          hardware_updated_at?: string | null
          id?: string
          location?: string | null
          logged_in_user?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          ram_total_gb?: number | null
          sector_id?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_inventory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_inventory_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_inventory_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "client_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_types: {
        Row: {
          created_at: string
          icon: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      imap_accounts: {
        Row: {
          client_id: string | null
          created_at: string
          host: string
          id: string
          is_active: boolean
          label: string
          last_checked_at: string | null
          password: string
          port: string
          updated_at: string
          username: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          host?: string
          id?: string
          is_active?: boolean
          label?: string
          last_checked_at?: string | null
          password?: string
          port?: string
          updated_at?: string
          username?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          host?: string
          id?: string
          is_active?: boolean
          label?: string
          last_checked_at?: string | null
          password?: string
          port?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "imap_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_api_keys: {
        Row: {
          api_key: string
          client_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
        }
        Insert: {
          api_key: string
          client_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
        }
        Update: {
          api_key?: string
          client_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_api_keys_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles: {
        Row: {
          category_id: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kb_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_articles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      mikrotik_devices: {
        Row: {
          api_port: number | null
          client_id: string
          created_at: string
          host: string
          id: string
          is_active: boolean
          last_dhcp_summary: Json | null
          last_error: string | null
          last_log_alerts: Json | null
          last_polled_at: string | null
          last_system_info: Json | null
          name: string
          password: string
          port: number
          proxy_url: string | null
          updated_at: string
          use_ssl: boolean
          username: string
        }
        Insert: {
          api_port?: number | null
          client_id: string
          created_at?: string
          host: string
          id?: string
          is_active?: boolean
          last_dhcp_summary?: Json | null
          last_error?: string | null
          last_log_alerts?: Json | null
          last_polled_at?: string | null
          last_system_info?: Json | null
          name: string
          password?: string
          port?: number
          proxy_url?: string | null
          updated_at?: string
          use_ssl?: boolean
          username?: string
        }
        Update: {
          api_port?: number | null
          client_id?: string
          created_at?: string
          host?: string
          id?: string
          is_active?: boolean
          last_dhcp_summary?: Json | null
          last_error?: string | null
          last_log_alerts?: Json | null
          last_polled_at?: string | null
          last_system_info?: Json | null
          name?: string
          password?: string
          port?: number
          proxy_url?: string | null
          updated_at?: string
          use_ssl?: boolean
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "mikrotik_devices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      mikrotik_interfaces: {
        Row: {
          device_id: string
          disabled: boolean
          dns_servers: string | null
          gateway: string | null
          id: string
          interface_name: string
          interface_type: string | null
          ip_address: string | null
          last_link_up: string | null
          mac_address: string | null
          pppoe_service: string | null
          pppoe_user: string | null
          running: boolean
          rx_bytes: number | null
          rx_drops: number | null
          rx_errors: number | null
          rx_packets: number | null
          rx_rate: number | null
          speed: string | null
          status: string
          tx_bytes: number | null
          tx_drops: number | null
          tx_errors: number | null
          tx_packets: number | null
          tx_rate: number | null
          updated_at: string
          uptime: string | null
        }
        Insert: {
          device_id: string
          disabled?: boolean
          dns_servers?: string | null
          gateway?: string | null
          id?: string
          interface_name: string
          interface_type?: string | null
          ip_address?: string | null
          last_link_up?: string | null
          mac_address?: string | null
          pppoe_service?: string | null
          pppoe_user?: string | null
          running?: boolean
          rx_bytes?: number | null
          rx_drops?: number | null
          rx_errors?: number | null
          rx_packets?: number | null
          rx_rate?: number | null
          speed?: string | null
          status?: string
          tx_bytes?: number | null
          tx_drops?: number | null
          tx_errors?: number | null
          tx_packets?: number | null
          tx_rate?: number | null
          updated_at?: string
          uptime?: string | null
        }
        Update: {
          device_id?: string
          disabled?: boolean
          dns_servers?: string | null
          gateway?: string | null
          id?: string
          interface_name?: string
          interface_type?: string | null
          ip_address?: string | null
          last_link_up?: string | null
          mac_address?: string | null
          pppoe_service?: string | null
          pppoe_user?: string | null
          running?: boolean
          rx_bytes?: number | null
          rx_drops?: number | null
          rx_errors?: number | null
          rx_packets?: number | null
          rx_rate?: number | null
          speed?: string | null
          status?: string
          tx_bytes?: number | null
          tx_drops?: number | null
          tx_errors?: number | null
          tx_packets?: number | null
          tx_rate?: number | null
          updated_at?: string
          uptime?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mikrotik_interfaces_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "mikrotik_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      mikrotik_ping_targets: {
        Row: {
          created_at: string
          device_id: string
          id: string
          is_active: boolean
          label: string
          last_checked_at: string | null
          latency_ms: number | null
          packet_loss_pct: number | null
          target_ip: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          is_active?: boolean
          label?: string
          last_checked_at?: string | null
          latency_ms?: number | null
          packet_loss_pct?: number | null
          target_ip: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          is_active?: boolean
          label?: string
          last_checked_at?: string | null
          latency_ms?: number | null
          packet_loss_pct?: number | null
          target_ip?: string
        }
        Relationships: [
          {
            foreignKeyName: "mikrotik_ping_targets_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "mikrotik_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          address_complement: string | null
          address_number: string | null
          city: string | null
          created_at: string
          email: string
          email_domain: string | null
          full_name: string
          id: string
          is_active: boolean
          must_change_password: boolean | null
          neighborhood: string | null
          parent_client_id: string | null
          phone: string | null
          sector_id: string | null
          updated_at: string
          whatsapp_group_id: string | null
        }
        Insert: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          city?: string | null
          created_at?: string
          email: string
          email_domain?: string | null
          full_name: string
          id: string
          is_active?: boolean
          must_change_password?: boolean | null
          neighborhood?: string | null
          parent_client_id?: string | null
          phone?: string | null
          sector_id?: string | null
          updated_at?: string
          whatsapp_group_id?: string | null
        }
        Update: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          city?: string | null
          created_at?: string
          email?: string
          email_domain?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          must_change_password?: boolean | null
          neighborhood?: string | null
          parent_client_id?: string | null
          phone?: string | null
          sector_id?: string | null
          updated_at?: string
          whatsapp_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_parent_client_id_fkey"
            columns: ["parent_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "client_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string | null
          description: string
          id: string
          item_order: number | null
          quantity: number
          quote_id: string
          total_price: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          item_order?: number | null
          quantity?: number
          quote_id: string
          total_price?: number | null
          unit_price?: number
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          item_order?: number | null
          quantity?: number
          quote_id?: string
          total_price?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_sender_profiles: {
        Row: {
          address: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          trade_name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          trade_name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          trade_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          client_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          quote_number: number
          sender_profile_id: string | null
          status: string
          title: string
          total: number | null
          updated_at: string | null
          validity_days: number | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          quote_number?: number
          sender_profile_id?: string | null
          status?: string
          title?: string
          total?: number | null
          updated_at?: string | null
          validity_days?: number | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          quote_number?: number
          sender_profile_id?: string | null
          status?: string
          title?: string
          total?: number | null
          updated_at?: string | null
          validity_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "quote_sender_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          arrival_date: string | null
          checked_by: string | null
          client_id: string
          client_signature: string | null
          completed_at: string | null
          created_at: string
          departure_date: string | null
          diagnosis: string | null
          equipment_removed: string | null
          id: string
          labor_cost: number | null
          material_used: string | null
          notes: string | null
          order_number: number
          parts_used: Json | null
          service_description: string | null
          solution: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["service_order_status"]
          technician_id: string | null
          technician_signature: string | null
          ticket_id: string | null
          total_cost: number | null
          travel_cost: number | null
          updated_at: string
        }
        Insert: {
          arrival_date?: string | null
          checked_by?: string | null
          client_id: string
          client_signature?: string | null
          completed_at?: string | null
          created_at?: string
          departure_date?: string | null
          diagnosis?: string | null
          equipment_removed?: string | null
          id?: string
          labor_cost?: number | null
          material_used?: string | null
          notes?: string | null
          order_number?: number
          parts_used?: Json | null
          service_description?: string | null
          solution?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["service_order_status"]
          technician_id?: string | null
          technician_signature?: string | null
          ticket_id?: string | null
          total_cost?: number | null
          travel_cost?: number | null
          updated_at?: string
        }
        Update: {
          arrival_date?: string | null
          checked_by?: string | null
          client_id?: string
          client_signature?: string | null
          completed_at?: string | null
          created_at?: string
          departure_date?: string | null
          diagnosis?: string | null
          equipment_removed?: string | null
          id?: string
          labor_cost?: number | null
          material_used?: string | null
          notes?: string | null
          order_number?: number
          parts_used?: Json | null
          service_description?: string | null
          solution?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["service_order_status"]
          technician_id?: string | null
          technician_signature?: string | null
          ticket_id?: string | null
          total_cost?: number | null
          travel_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      ticket_checklist_items: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          is_completed: boolean
          item_order: number
          kb_article_id: string | null
          ticket_checklist_id: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          item_order?: number
          kb_article_id?: string | null
          ticket_checklist_id: string
          title: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          item_order?: number
          kb_article_id?: string | null
          ticket_checklist_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_checklist_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_checklist_items_kb_article_id_fkey"
            columns: ["kb_article_id"]
            isOneToOne: false
            referencedRelation: "kb_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_checklist_items_ticket_checklist_id_fkey"
            columns: ["ticket_checklist_id"]
            isOneToOne: false
            referencedRelation: "ticket_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_checklists: {
        Row: {
          created_at: string
          id: string
          template_id: string
          template_name: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          template_id: string
          template_name: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          template_id?: string
          template_name?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_checklists_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          created_at: string
          id: string
          is_internal: boolean
          message: string
          sender_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_internal?: boolean
          message: string
          sender_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_internal?: boolean
          message?: string
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_ratings: {
        Row: {
          client_id: string
          comment: string | null
          created_at: string
          id: string
          rated_at: string
          rating: number | null
          rating_source: string | null
          rating_token: string
          technician_id: string | null
          ticket_id: string
        }
        Insert: {
          client_id: string
          comment?: string | null
          created_at?: string
          id?: string
          rated_at?: string
          rating?: number | null
          rating_source?: string | null
          rating_token?: string
          technician_id?: string | null
          ticket_id: string
        }
        Update: {
          client_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          rated_at?: string
          rating?: number | null
          rating_source?: string | null
          rating_token?: string
          technician_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_ratings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_ratings_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_ratings_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          client_id: string
          client_signature: string | null
          created_at: string
          created_by: string | null
          description: string
          equipment_id: string | null
          equipment_info: string | null
          equipment_type_id: string | null
          id: string
          incident_message: string | null
          is_incident: boolean
          parent_incident_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          sector_id: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          technician_signature: string | null
          ticket_number: number
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id: string
          client_signature?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          equipment_id?: string | null
          equipment_info?: string | null
          equipment_type_id?: string | null
          id?: string
          incident_message?: string | null
          is_incident?: boolean
          parent_incident_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          sector_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          technician_signature?: string | null
          ticket_number?: number
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string
          client_signature?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          equipment_id?: string | null
          equipment_info?: string | null
          equipment_type_id?: string | null
          id?: string
          incident_message?: string | null
          is_incident?: boolean
          parent_incident_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          sector_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          technician_signature?: string | null
          ticket_number?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_parent_incident_id_fkey"
            columns: ["parent_incident_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "client_sectors"
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
      whatsapp_notification_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_preview: string | null
          notification_type: string
          recipient_phone: string
          status: string
          ticket_id: string | null
          ticket_number: number | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_preview?: string | null
          notification_type: string
          recipient_phone: string
          status?: string
          ticket_id?: string | null
          ticket_number?: number | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_preview?: string | null
          notification_type?: string
          recipient_phone?: string
          status?: string
          ticket_id?: string | null
          ticket_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_notification_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
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
    }
    Enums: {
      app_role: "admin" | "user" | "client" | "technician"
      equipment_status: "active" | "inactive" | "maintenance" | "retired"
      service_order_status: "draft" | "in_progress" | "completed" | "cancelled"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status:
        | "open"
        | "in_progress"
        | "waiting_client"
        | "resolved"
        | "closed"
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
      app_role: ["admin", "user", "client", "technician"],
      equipment_status: ["active", "inactive", "maintenance", "retired"],
      service_order_status: ["draft", "in_progress", "completed", "cancelled"],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: [
        "open",
        "in_progress",
        "waiting_client",
        "resolved",
        "closed",
      ],
    },
  },
} as const

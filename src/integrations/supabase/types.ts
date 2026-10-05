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
      backup_agents: {
        Row: {
          active: boolean
          api_key: string
          created_at: string
          hostname: string | null
          id: string
          last_seen_at: string | null
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          api_key: string
          created_at?: string
          hostname?: string | null
          id?: string
          last_seen_at?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          api_key?: string
          created_at?: string
          hostname?: string | null
          id?: string
          last_seen_at?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      backup_jobs: {
        Row: {
          agent_id: string | null
          created_at: string
          dest_path: string
          id: string
          is_active: boolean
          job_type: string
          mirror: boolean
          name: string
          notify_on_error: boolean
          notify_on_finish: boolean
          notify_on_progress: boolean
          notify_on_start: boolean
          notify_phone: string | null
          progress_step_pct: number
          schedule_cron: string | null
          source_path: string
          threads: number
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          dest_path: string
          id?: string
          is_active?: boolean
          job_type?: string
          mirror?: boolean
          name: string
          notify_on_error?: boolean
          notify_on_finish?: boolean
          notify_on_progress?: boolean
          notify_on_start?: boolean
          notify_phone?: string | null
          progress_step_pct?: number
          schedule_cron?: string | null
          source_path: string
          threads?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          dest_path?: string
          id?: string
          is_active?: boolean
          job_type?: string
          mirror?: boolean
          name?: string
          notify_on_error?: boolean
          notify_on_finish?: boolean
          notify_on_progress?: boolean
          notify_on_start?: boolean
          notify_phone?: string | null
          progress_step_pct?: number
          schedule_cron?: string | null
          source_path?: string
          threads?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "backup_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_run_logs: {
        Row: {
          created_at: string
          id: string
          level: string
          message: string
          run_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string
          message: string
          run_id: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          message?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_run_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "backup_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_runs: {
        Row: {
          agent_id: string | null
          backup_type: string
          bytes: number
          created_at: string
          current_file: string | null
          dest_dir: string | null
          error_message: string | null
          eta_seconds: number | null
          failed: number
          finished_at: string | null
          id: string
          job_id: string | null
          last_notified_pct: number
          processed_files: number
          providers: string | null
          skipped: number
          source_dir: string | null
          speed_bps: number | null
          started_at: string
          status: string
          total_files: number
          updated: number
          updated_at: string
          uploaded: number
        }
        Insert: {
          agent_id?: string | null
          backup_type?: string
          bytes?: number
          created_at?: string
          current_file?: string | null
          dest_dir?: string | null
          error_message?: string | null
          eta_seconds?: number | null
          failed?: number
          finished_at?: string | null
          id?: string
          job_id?: string | null
          last_notified_pct?: number
          processed_files?: number
          providers?: string | null
          skipped?: number
          source_dir?: string | null
          speed_bps?: number | null
          started_at?: string
          status?: string
          total_files?: number
          updated?: number
          updated_at?: string
          uploaded?: number
        }
        Update: {
          agent_id?: string | null
          backup_type?: string
          bytes?: number
          created_at?: string
          current_file?: string | null
          dest_dir?: string | null
          error_message?: string | null
          eta_seconds?: number | null
          failed?: number
          finished_at?: string | null
          id?: string
          job_id?: string | null
          last_notified_pct?: number
          processed_files?: number
          providers?: string | null
          skipped?: number
          source_dir?: string | null
          speed_bps?: number | null
          started_at?: string
          status?: string
          total_files?: number
          updated?: number
          updated_at?: string
          uploaded?: number
        }
        Relationships: [
          {
            foreignKeyName: "backup_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "backup_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "backup_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
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
      collector_agent_status: {
        Row: {
          agent_key: string
          agent_type: string
          created_at: string
          host: string | null
          id: string
          last_seen_at: string
          name: string | null
          updated_at: string
          version: string | null
        }
        Insert: {
          agent_key: string
          agent_type: string
          created_at?: string
          host?: string | null
          id?: string
          last_seen_at?: string
          name?: string | null
          updated_at?: string
          version?: string | null
        }
        Update: {
          agent_key?: string
          agent_type?: string
          created_at?: string
          host?: string | null
          id?: string
          last_seen_at?: string
          name?: string | null
          updated_at?: string
          version?: string | null
        }
        Relationships: []
      }
      dvr_cameras: {
        Row: {
          camera_type: string | null
          channel: number
          codec: string | null
          created_at: string
          dvr_id: string
          fps: number | null
          id: string
          last_checked_at: string | null
          motion_detect: boolean | null
          name: string
          recording_status: string | null
          resolution: string | null
          rtsp_url: string | null
          status: string
          updated_at: string
          video_loss: boolean | null
        }
        Insert: {
          camera_type?: string | null
          channel?: number
          codec?: string | null
          created_at?: string
          dvr_id: string
          fps?: number | null
          id?: string
          last_checked_at?: string | null
          motion_detect?: boolean | null
          name: string
          recording_status?: string | null
          resolution?: string | null
          rtsp_url?: string | null
          status?: string
          updated_at?: string
          video_loss?: boolean | null
        }
        Update: {
          camera_type?: string | null
          channel?: number
          codec?: string | null
          created_at?: string
          dvr_id?: string
          fps?: number | null
          id?: string
          last_checked_at?: string | null
          motion_detect?: boolean | null
          name?: string
          recording_status?: string | null
          resolution?: string | null
          rtsp_url?: string | null
          status?: string
          updated_at?: string
          video_loss?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "dvr_cameras_dvr_id_fkey"
            columns: ["dvr_id"]
            isOneToOne: false
            referencedRelation: "dvr_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      dvr_devices: {
        Row: {
          client_id: string
          created_at: string
          device_model: string | null
          disk_free_gb: number | null
          disk_total_gb: number | null
          disk_usage_pct: number | null
          disk_used_gb: number | null
          firmware_version: string | null
          host: string
          id: string
          is_active: boolean
          last_error: string | null
          last_polled_at: string | null
          name: string
          password: string
          port: number
          recording_status: string | null
          serial_number: string | null
          status: string
          total_channels: number | null
          updated_at: string
          uptime_seconds: number | null
          username: string
        }
        Insert: {
          client_id: string
          created_at?: string
          device_model?: string | null
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_usage_pct?: number | null
          disk_used_gb?: number | null
          firmware_version?: string | null
          host: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_polled_at?: string | null
          name: string
          password?: string
          port?: number
          recording_status?: string | null
          serial_number?: string | null
          status?: string
          total_channels?: number | null
          updated_at?: string
          uptime_seconds?: number | null
          username?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          device_model?: string | null
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_usage_pct?: number | null
          disk_used_gb?: number | null
          firmware_version?: string | null
          host?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_polled_at?: string | null
          name?: string
          password?: string
          port?: number
          recording_status?: string | null
          serial_number?: string | null
          status?: string
          total_channels?: number | null
          updated_at?: string
          uptime_seconds?: number | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "dvr_devices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      dvr_events: {
        Row: {
          camera_id: string | null
          dvr_id: string
          event_type: string
          id: string
          message: string | null
          recorded_at: string
        }
        Insert: {
          camera_id?: string | null
          dvr_id: string
          event_type: string
          id?: string
          message?: string | null
          recorded_at?: string
        }
        Update: {
          camera_id?: string | null
          dvr_id?: string
          event_type?: string
          id?: string
          message?: string | null
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dvr_events_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "dvr_cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dvr_events_dvr_id_fkey"
            columns: ["dvr_id"]
            isOneToOne: false
            referencedRelation: "dvr_devices"
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
      ilo_events: {
        Row: {
          category: string | null
          created_at: string
          event_key: string
          id: string
          message: string
          notified: boolean
          recorded_at: string
          server_id: string
          severity: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          event_key: string
          id?: string
          message: string
          notified?: boolean
          recorded_at?: string
          server_id: string
          severity?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          event_key?: string
          id?: string
          message?: string
          notified?: boolean
          recorded_at?: string
          server_id?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "ilo_events_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "ilo_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      ilo_sensors: {
        Row: {
          created_at: string
          details: Json | null
          health: string | null
          id: string
          location: string | null
          name: string
          reading: number | null
          sensor_type: string
          server_id: string
          status: string | null
          unit: string | null
          updated_at: string
          upper_critical: number | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          health?: string | null
          id?: string
          location?: string | null
          name: string
          reading?: number | null
          sensor_type: string
          server_id: string
          status?: string | null
          unit?: string | null
          updated_at?: string
          upper_critical?: number | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          health?: string | null
          id?: string
          location?: string | null
          name?: string
          reading?: number | null
          sensor_type?: string
          server_id?: string
          status?: string | null
          unit?: string | null
          updated_at?: string
          upper_critical?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ilo_sensors_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "ilo_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      ilo_servers: {
        Row: {
          bios_version: string | null
          client_id: string
          consecutive_failures: number
          cpu_count: number | null
          cpu_model: string | null
          created_at: string
          health_fans: string | null
          health_memory: string | null
          health_network: string | null
          health_power: string | null
          health_processor: string | null
          health_storage: string | null
          health_summary: string | null
          health_temperature: string | null
          host: string
          id: string
          ilo_firmware: string | null
          ilo_version: string | null
          indicator_led: string | null
          is_active: boolean
          last_error: string | null
          last_polled_at: string | null
          last_success_at: string | null
          name: string
          password: string
          port: number
          post_state: string | null
          power_state: string | null
          ram_total_gb: number | null
          serial_number: string | null
          server_model: string | null
          status: string
          updated_at: string
          uptime_seconds: number | null
          username: string
          vendor: string
        }
        Insert: {
          bios_version?: string | null
          client_id: string
          consecutive_failures?: number
          cpu_count?: number | null
          cpu_model?: string | null
          created_at?: string
          health_fans?: string | null
          health_memory?: string | null
          health_network?: string | null
          health_power?: string | null
          health_processor?: string | null
          health_storage?: string | null
          health_summary?: string | null
          health_temperature?: string | null
          host: string
          id?: string
          ilo_firmware?: string | null
          ilo_version?: string | null
          indicator_led?: string | null
          is_active?: boolean
          last_error?: string | null
          last_polled_at?: string | null
          last_success_at?: string | null
          name: string
          password: string
          port?: number
          post_state?: string | null
          power_state?: string | null
          ram_total_gb?: number | null
          serial_number?: string | null
          server_model?: string | null
          status?: string
          updated_at?: string
          uptime_seconds?: number | null
          username: string
          vendor?: string
        }
        Update: {
          bios_version?: string | null
          client_id?: string
          consecutive_failures?: number
          cpu_count?: number | null
          cpu_model?: string | null
          created_at?: string
          health_fans?: string | null
          health_memory?: string | null
          health_network?: string | null
          health_power?: string | null
          health_processor?: string | null
          health_storage?: string | null
          health_summary?: string | null
          health_temperature?: string | null
          host?: string
          id?: string
          ilo_firmware?: string | null
          ilo_version?: string | null
          indicator_led?: string | null
          is_active?: boolean
          last_error?: string | null
          last_polled_at?: string | null
          last_success_at?: string | null
          name?: string
          password?: string
          port?: number
          post_state?: string | null
          power_state?: string | null
          ram_total_gb?: number | null
          serial_number?: string | null
          server_model?: string | null
          status?: string
          updated_at?: string
          uptime_seconds?: number | null
          username?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "ilo_servers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
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
          device_type: string
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
          snmp_auth_passphrase: string | null
          snmp_auth_protocol: string | null
          snmp_community: string | null
          snmp_priv_passphrase: string | null
          snmp_priv_protocol: string | null
          snmp_security_level: string | null
          snmp_user: string | null
          snmp_version: string | null
          updated_at: string
          use_ssl: boolean
          username: string
        }
        Insert: {
          api_port?: number | null
          client_id: string
          created_at?: string
          device_type?: string
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
          snmp_auth_passphrase?: string | null
          snmp_auth_protocol?: string | null
          snmp_community?: string | null
          snmp_priv_passphrase?: string | null
          snmp_priv_protocol?: string | null
          snmp_security_level?: string | null
          snmp_user?: string | null
          snmp_version?: string | null
          updated_at?: string
          use_ssl?: boolean
          username?: string
        }
        Update: {
          api_port?: number | null
          client_id?: string
          created_at?: string
          device_type?: string
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
          snmp_auth_passphrase?: string | null
          snmp_auth_protocol?: string | null
          snmp_community?: string | null
          snmp_priv_passphrase?: string | null
          snmp_priv_protocol?: string | null
          snmp_security_level?: string | null
          snmp_user?: string | null
          snmp_version?: string | null
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
      mikrotik_dhcp_history: {
        Row: {
          active_leases: number
          by_server: Json | null
          device_id: string
          dynamic_leases: number
          id: string
          recorded_at: string
          static_leases: number
          total_leases: number
        }
        Insert: {
          active_leases?: number
          by_server?: Json | null
          device_id: string
          dynamic_leases?: number
          id?: string
          recorded_at?: string
          static_leases?: number
          total_leases?: number
        }
        Update: {
          active_leases?: number
          by_server?: Json | null
          device_id?: string
          dynamic_leases?: number
          id?: string
          recorded_at?: string
          static_leases?: number
          total_leases?: number
        }
        Relationships: [
          {
            foreignKeyName: "mikrotik_dhcp_history_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "mikrotik_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      mikrotik_interface_events: {
        Row: {
          device_id: string
          event_type: string
          id: string
          interface_name: string
          recorded_at: string
        }
        Insert: {
          device_id: string
          event_type: string
          id?: string
          interface_name: string
          recorded_at?: string
        }
        Update: {
          device_id?: string
          event_type?: string
          id?: string
          interface_name?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mikrotik_interface_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "mikrotik_devices"
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
      mikrotik_system_history: {
        Row: {
          cpu_load: number | null
          cpu_temp: number | null
          device_id: string
          id: string
          memory_used_pct: number | null
          recorded_at: string
          voltage: number | null
        }
        Insert: {
          cpu_load?: number | null
          cpu_temp?: number | null
          device_id: string
          id?: string
          memory_used_pct?: number | null
          recorded_at?: string
          voltage?: number | null
        }
        Update: {
          cpu_load?: number | null
          cpu_temp?: number | null
          device_id?: string
          id?: string
          memory_used_pct?: number | null
          recorded_at?: string
          voltage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mikrotik_system_history_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "mikrotik_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      mikrotik_traffic_history: {
        Row: {
          device_id: string
          id: string
          interface_name: string
          recorded_at: string
          rx_bytes: number
          rx_errors: number
          rx_packets: number
          tx_bytes: number
          tx_errors: number
          tx_packets: number
        }
        Insert: {
          device_id: string
          id?: string
          interface_name: string
          recorded_at?: string
          rx_bytes?: number
          rx_errors?: number
          rx_packets?: number
          tx_bytes?: number
          tx_errors?: number
          tx_packets?: number
        }
        Update: {
          device_id?: string
          id?: string
          interface_name?: string
          recorded_at?: string
          rx_bytes?: number
          rx_errors?: number
          rx_packets?: number
          tx_bytes?: number
          tx_errors?: number
          tx_packets?: number
        }
        Relationships: [
          {
            foreignKeyName: "mikrotik_traffic_history_device_id_fkey"
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
      provisioning_requests: {
        Row: {
          agent_key: string | null
          claimed_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          email: string | null
          email_status: string
          finished_at: string | null
          full_name: string
          id: string
          initial_password: string | null
          job_title: string | null
          log: string | null
          notify_on_completion: boolean
          operation: string
          phone: string | null
          sector_id: string | null
          source_request_id: string | null
          status: string
          steps: Json
          updated_at: string
          username: string
          whatsapp_notification_error: string | null
          whatsapp_notification_status: string
          whatsapp_notified_at: string | null
        }
        Insert: {
          agent_key?: string | null
          claimed_at?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_status?: string
          finished_at?: string | null
          full_name: string
          id?: string
          initial_password?: string | null
          job_title?: string | null
          log?: string | null
          notify_on_completion?: boolean
          operation?: string
          phone?: string | null
          sector_id?: string | null
          source_request_id?: string | null
          status?: string
          steps?: Json
          updated_at?: string
          username: string
          whatsapp_notification_error?: string | null
          whatsapp_notification_status?: string
          whatsapp_notified_at?: string | null
        }
        Update: {
          agent_key?: string | null
          claimed_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_status?: string
          finished_at?: string | null
          full_name?: string
          id?: string
          initial_password?: string | null
          job_title?: string | null
          log?: string | null
          notify_on_completion?: boolean
          operation?: string
          phone?: string | null
          sector_id?: string | null
          source_request_id?: string | null
          status?: string
          steps?: Json
          updated_at?: string
          username?: string
          whatsapp_notification_error?: string | null
          whatsapp_notification_status?: string
          whatsapp_notified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisioning_requests_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "client_sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisioning_requests_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "provisioning_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      provisioning_templates: {
        Row: {
          ad_groups: string[]
          ad_ou: string | null
          base_path: string | null
          client_id: string
          created_at: string
          email_domain: string | null
          email_groups: string[]
          home_drive: string | null
          id: string
          sector_id: string | null
          subfolders: string[]
          updated_at: string
        }
        Insert: {
          ad_groups?: string[]
          ad_ou?: string | null
          base_path?: string | null
          client_id: string
          created_at?: string
          email_domain?: string | null
          email_groups?: string[]
          home_drive?: string | null
          id?: string
          sector_id?: string | null
          subfolders?: string[]
          updated_at?: string
        }
        Update: {
          ad_groups?: string[]
          ad_ou?: string | null
          base_path?: string | null
          client_id?: string
          created_at?: string
          email_domain?: string | null
          email_groups?: string[]
          home_drive?: string | null
          id?: string
          sector_id?: string | null
          subfolders?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisioning_templates_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "client_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      proxmox_guests: {
        Row: {
          cpu_count: number | null
          cpu_usage_pct: number | null
          created_at: string
          disk_total_gb: number | null
          disk_used_gb: number | null
          guest_type: string
          id: string
          name: string
          node_id: string
          ram_total_gb: number | null
          ram_usage_pct: number | null
          ram_used_gb: number | null
          status: string
          tags: string | null
          updated_at: string
          uptime_seconds: number | null
          vmid: number
        }
        Insert: {
          cpu_count?: number | null
          cpu_usage_pct?: number | null
          created_at?: string
          disk_total_gb?: number | null
          disk_used_gb?: number | null
          guest_type?: string
          id?: string
          name: string
          node_id: string
          ram_total_gb?: number | null
          ram_usage_pct?: number | null
          ram_used_gb?: number | null
          status?: string
          tags?: string | null
          updated_at?: string
          uptime_seconds?: number | null
          vmid: number
        }
        Update: {
          cpu_count?: number | null
          cpu_usage_pct?: number | null
          created_at?: string
          disk_total_gb?: number | null
          disk_used_gb?: number | null
          guest_type?: string
          id?: string
          name?: string
          node_id?: string
          ram_total_gb?: number | null
          ram_usage_pct?: number | null
          ram_used_gb?: number | null
          status?: string
          tags?: string | null
          updated_at?: string
          uptime_seconds?: number | null
          vmid?: number
        }
        Relationships: [
          {
            foreignKeyName: "proxmox_guests_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "proxmox_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      proxmox_interfaces: {
        Row: {
          created_at: string
          id: string
          interface_name: string
          mac_address: string | null
          node_id: string
          rx_bytes: number | null
          rx_errors: number | null
          rx_rate_bps: number | null
          speed_mbps: number | null
          status: string
          tx_bytes: number | null
          tx_errors: number | null
          tx_rate_bps: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          interface_name: string
          mac_address?: string | null
          node_id: string
          rx_bytes?: number | null
          rx_errors?: number | null
          rx_rate_bps?: number | null
          speed_mbps?: number | null
          status?: string
          tx_bytes?: number | null
          tx_errors?: number | null
          tx_rate_bps?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          interface_name?: string
          mac_address?: string | null
          node_id?: string
          rx_bytes?: number | null
          rx_errors?: number | null
          rx_rate_bps?: number | null
          speed_mbps?: number | null
          status?: string
          tx_bytes?: number | null
          tx_errors?: number | null
          tx_rate_bps?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proxmox_interfaces_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "proxmox_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      proxmox_nodes: {
        Row: {
          auth_mode: string
          client_id: string
          cpu_cores: number | null
          cpu_model: string | null
          cpu_usage_pct: number | null
          created_at: string
          disk_total_gb: number | null
          disk_usage_pct: number | null
          disk_used_gb: number | null
          host: string
          id: string
          is_active: boolean
          last_error: string | null
          last_polled_at: string | null
          load_avg: number | null
          name: string
          node_name: string | null
          password: string | null
          port: number
          pve_version: string | null
          ram_total_gb: number | null
          ram_usage_pct: number | null
          ram_used_gb: number | null
          status: string
          storages: Json | null
          swap_total_gb: number | null
          swap_used_gb: number | null
          token_name: string | null
          token_secret: string | null
          updated_at: string
          uptime_seconds: number | null
          username: string
        }
        Insert: {
          auth_mode?: string
          client_id: string
          cpu_cores?: number | null
          cpu_model?: string | null
          cpu_usage_pct?: number | null
          created_at?: string
          disk_total_gb?: number | null
          disk_usage_pct?: number | null
          disk_used_gb?: number | null
          host: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_polled_at?: string | null
          load_avg?: number | null
          name: string
          node_name?: string | null
          password?: string | null
          port?: number
          pve_version?: string | null
          ram_total_gb?: number | null
          ram_usage_pct?: number | null
          ram_used_gb?: number | null
          status?: string
          storages?: Json | null
          swap_total_gb?: number | null
          swap_used_gb?: number | null
          token_name?: string | null
          token_secret?: string | null
          updated_at?: string
          uptime_seconds?: number | null
          username?: string
        }
        Update: {
          auth_mode?: string
          client_id?: string
          cpu_cores?: number | null
          cpu_model?: string | null
          cpu_usage_pct?: number | null
          created_at?: string
          disk_total_gb?: number | null
          disk_usage_pct?: number | null
          disk_used_gb?: number | null
          host?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_polled_at?: string | null
          load_avg?: number | null
          name?: string
          node_name?: string | null
          password?: string | null
          port?: number
          pve_version?: string | null
          ram_total_gb?: number | null
          ram_usage_pct?: number | null
          ram_used_gb?: number | null
          status?: string
          storages?: Json | null
          swap_total_gb?: number | null
          swap_used_gb?: number | null
          token_name?: string | null
          token_secret?: string | null
          updated_at?: string
          uptime_seconds?: number | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "proxmox_nodes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      server_sensor_alerts: {
        Row: {
          created_at: string
          first_detected_at: string
          id: string
          last_notified_at: string | null
          last_seen_at: string
          message: string | null
          reading: number | null
          resolved_at: string | null
          sensor_key: string
          sensor_name: string
          sensor_type: string | null
          server_id: string
          severity: string
          status: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_detected_at?: string
          id?: string
          last_notified_at?: string | null
          last_seen_at?: string
          message?: string | null
          reading?: number | null
          resolved_at?: string | null
          sensor_key: string
          sensor_name: string
          sensor_type?: string | null
          server_id: string
          severity?: string
          status?: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_detected_at?: string
          id?: string
          last_notified_at?: string | null
          last_seen_at?: string
          message?: string | null
          reading?: number | null
          resolved_at?: string | null
          sensor_key?: string
          sensor_name?: string
          sensor_type?: string | null
          server_id?: string
          severity?: string
          status?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_sensor_alerts_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "ilo_servers"
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
      sophos_alerts: {
        Row: {
          created_at: string
          firewall_id: string
          id: string
          message: string
          resolved: boolean
          severity: string
          title: string
        }
        Insert: {
          created_at?: string
          firewall_id: string
          id?: string
          message: string
          resolved?: boolean
          severity: string
          title: string
        }
        Update: {
          created_at?: string
          firewall_id?: string
          id?: string
          message?: string
          resolved?: boolean
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sophos_alerts_firewall_id_fkey"
            columns: ["firewall_id"]
            isOneToOne: false
            referencedRelation: "sophos_firewalls"
            referencedColumns: ["id"]
          },
        ]
      }
      sophos_firewalls: {
        Row: {
          api_token: string
          client_id: string
          created_at: string
          firmware_version: string | null
          id: string
          last_seen_at: string | null
          model: string | null
          name: string
          serial_number: string | null
          sophos_ip: string | null
          status: string
          updated_at: string
        }
        Insert: {
          api_token: string
          client_id: string
          created_at?: string
          firmware_version?: string | null
          id?: string
          last_seen_at?: string | null
          model?: string | null
          name: string
          serial_number?: string | null
          sophos_ip?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          api_token?: string
          client_id?: string
          created_at?: string
          firmware_version?: string | null
          id?: string
          last_seen_at?: string | null
          model?: string | null
          name?: string
          serial_number?: string | null
          sophos_ip?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sophos_firewalls_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sophos_telemetry_logs: {
        Row: {
          cpu_usage: number | null
          created_at: string
          disk_usage: number | null
          firewall_id: string
          id: string
          interfaces: Json | null
          memory_usage: number | null
          raw_payload: Json | null
          vpn_tunnels: Json | null
        }
        Insert: {
          cpu_usage?: number | null
          created_at?: string
          disk_usage?: number | null
          firewall_id: string
          id?: string
          interfaces?: Json | null
          memory_usage?: number | null
          raw_payload?: Json | null
          vpn_tunnels?: Json | null
        }
        Update: {
          cpu_usage?: number | null
          created_at?: string
          disk_usage?: number | null
          firewall_id?: string
          id?: string
          interfaces?: Json | null
          memory_usage?: number | null
          raw_payload?: Json | null
          vpn_tunnels?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sophos_telemetry_logs_firewall_id_fkey"
            columns: ["firewall_id"]
            isOneToOne: false
            referencedRelation: "sophos_firewalls"
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
      vmware_hosts: {
        Row: {
          client_id: string
          cpu_cores: number | null
          cpu_usage_pct: number | null
          created_at: string
          datastores: Json | null
          esxi_version: string | null
          host: string
          id: string
          is_active: boolean
          last_error: string | null
          last_polled_at: string | null
          name: string
          password: string
          port: number
          ram_total_gb: number | null
          ram_usage_pct: number | null
          ram_used_gb: number | null
          status: string
          updated_at: string
          uptime_seconds: number | null
          username: string
        }
        Insert: {
          client_id: string
          cpu_cores?: number | null
          cpu_usage_pct?: number | null
          created_at?: string
          datastores?: Json | null
          esxi_version?: string | null
          host: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_polled_at?: string | null
          name: string
          password?: string
          port?: number
          ram_total_gb?: number | null
          ram_usage_pct?: number | null
          ram_used_gb?: number | null
          status?: string
          updated_at?: string
          uptime_seconds?: number | null
          username?: string
        }
        Update: {
          client_id?: string
          cpu_cores?: number | null
          cpu_usage_pct?: number | null
          created_at?: string
          datastores?: Json | null
          esxi_version?: string | null
          host?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_polled_at?: string | null
          name?: string
          password?: string
          port?: number
          ram_total_gb?: number | null
          ram_usage_pct?: number | null
          ram_used_gb?: number | null
          status?: string
          updated_at?: string
          uptime_seconds?: number | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "vmware_hosts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      vmware_vms: {
        Row: {
          cpu_count: number | null
          created_at: string
          disk_provisioned_gb: number | null
          disk_used_gb: number | null
          guest_os: string | null
          host_id: string
          id: string
          ip_address: string | null
          name: string
          power_state: string
          ram_mb: number | null
          tools_status: string | null
          updated_at: string
          uptime_seconds: number | null
        }
        Insert: {
          cpu_count?: number | null
          created_at?: string
          disk_provisioned_gb?: number | null
          disk_used_gb?: number | null
          guest_os?: string | null
          host_id: string
          id?: string
          ip_address?: string | null
          name: string
          power_state?: string
          ram_mb?: number | null
          tools_status?: string | null
          updated_at?: string
          uptime_seconds?: number | null
        }
        Update: {
          cpu_count?: number | null
          created_at?: string
          disk_provisioned_gb?: number | null
          disk_used_gb?: number | null
          guest_os?: string | null
          host_id?: string
          id?: string
          ip_address?: string | null
          name?: string
          power_state?: string
          ram_mb?: number | null
          tools_status?: string | null
          updated_at?: string
          uptime_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vmware_vms_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "vmware_hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          active_ticket_id: string | null
          client_id: string | null
          context: Json
          created_at: string
          last_message_at: string
          phone: string
          profile_id: string | null
          state: string
          updated_at: string
        }
        Insert: {
          active_ticket_id?: string | null
          client_id?: string | null
          context?: Json
          created_at?: string
          last_message_at?: string
          phone: string
          profile_id?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          active_ticket_id?: string | null
          client_id?: string | null
          context?: Json
          created_at?: string
          last_message_at?: string
          phone?: string
          profile_id?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_active_ticket_id_fkey"
            columns: ["active_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      windows_servers: {
        Row: {
          client_id: string
          cpu_usage: number | null
          created_at: string
          disk_free_gb: number | null
          disk_total_gb: number | null
          disk_usage_pct: number | null
          disk_used_gb: number | null
          host: string
          id: string
          is_active: boolean
          last_boot_time: string | null
          last_error: string | null
          last_polled_at: string | null
          name: string
          os_version: string | null
          ram_total_gb: number | null
          ram_usage_pct: number | null
          ram_used_gb: number | null
          services_status: Json | null
          status: string
          updated_at: string
          uptime_seconds: number | null
        }
        Insert: {
          client_id: string
          cpu_usage?: number | null
          created_at?: string
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_usage_pct?: number | null
          disk_used_gb?: number | null
          host: string
          id?: string
          is_active?: boolean
          last_boot_time?: string | null
          last_error?: string | null
          last_polled_at?: string | null
          name: string
          os_version?: string | null
          ram_total_gb?: number | null
          ram_usage_pct?: number | null
          ram_used_gb?: number | null
          services_status?: Json | null
          status?: string
          updated_at?: string
          uptime_seconds?: number | null
        }
        Update: {
          client_id?: string
          cpu_usage?: number | null
          created_at?: string
          disk_free_gb?: number | null
          disk_total_gb?: number | null
          disk_usage_pct?: number | null
          disk_used_gb?: number | null
          host?: string
          id?: string
          is_active?: boolean
          last_boot_time?: string | null
          last_error?: string | null
          last_polled_at?: string | null
          name?: string
          os_version?: string | null
          ram_total_gb?: number | null
          ram_usage_pct?: number | null
          ram_used_gb?: number | null
          services_status?: Json | null
          status?: string
          updated_at?: string
          uptime_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "windows_servers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_dhcp_history: { Args: never; Returns: undefined }
      cleanup_old_mikrotik_history: { Args: never; Returns: undefined }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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

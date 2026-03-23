import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { type } = body;

    if (type === "windows") {
      const { server_id, cpu_usage, ram_total_gb, ram_used_gb, ram_usage_pct, disk_total_gb, disk_used_gb, disk_free_gb, disk_usage_pct, uptime_seconds, last_boot_time, os_version, services_status } = body;

      if (!server_id) {
        return new Response(JSON.stringify({ error: "server_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { error } = await supabase.from("windows_servers").update({
        status: "online",
        cpu_usage,
        ram_total_gb,
        ram_used_gb,
        ram_usage_pct,
        disk_total_gb,
        disk_used_gb,
        disk_free_gb,
        disk_usage_pct,
        uptime_seconds,
        last_boot_time,
        os_version,
        services_status,
        last_polled_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", server_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type === "vmware") {
      const { host_id, cpu_cores, cpu_usage_pct, ram_total_gb, ram_used_gb, ram_usage_pct, esxi_version, uptime_seconds, datastores, vms } = body;

      if (!host_id) {
        return new Response(JSON.stringify({ error: "host_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Update host
      const { error: hostErr } = await supabase.from("vmware_hosts").update({
        status: "online",
        cpu_cores,
        cpu_usage_pct,
        ram_total_gb,
        ram_used_gb,
        ram_usage_pct,
        esxi_version,
        uptime_seconds,
        datastores,
        last_polled_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", host_id);

      if (hostErr) throw hostErr;

      // Sync VMs
      if (vms && Array.isArray(vms)) {
        // Delete old VMs for this host
        await supabase.from("vmware_vms").delete().eq("host_id", host_id);

        // Insert new ones
        if (vms.length > 0) {
          const vmRecords = vms.map((vm: any) => ({
            host_id,
            name: vm.name,
            power_state: vm.power_state || "unknown",
            guest_os: vm.guest_os,
            cpu_count: vm.cpu_count,
            ram_mb: vm.ram_mb,
            ip_address: vm.ip_address,
            tools_status: vm.tools_status,
            disk_used_gb: vm.disk_used_gb,
            disk_provisioned_gb: vm.disk_provisioned_gb,
            uptime_seconds: vm.uptime_seconds,
          }));
          const { error: vmErr } = await supabase.from("vmware_vms").insert(vmRecords);
          if (vmErr) throw vmErr;
        }
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // List servers/hosts for collector script
    if (type === "list-windows") {
      const { data } = await supabase.from("windows_servers").select("id, name, host").eq("is_active", true);
      return new Response(JSON.stringify(data || []), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type === "list-vmware") {
      const { data } = await supabase.from("vmware_hosts").select("id, name, host, username, password, port").eq("is_active", true);
      return new Response(JSON.stringify(data || []), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

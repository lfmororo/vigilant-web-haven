import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase environment variables');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { camera_id, stream_type = 'main' } = await req.json();

    if (!camera_id) {
      return new Response(JSON.stringify({ error: 'camera_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Fetching camera stream info for camera_id: ${camera_id}`);

    // Fetch camera data - RLS ensures user can only access assigned cameras
    const { data: camera, error } = await supabase
      .from('cameras')
      .select('id, name, serial_number, device_ip, device_username, device_password, channel, is_active')
      .eq('id', camera_id)
      .maybeSingle();

    if (error) {
      console.error('Database error:', error);
      return new Response(JSON.stringify({ error: 'Erro ao buscar câmera' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!camera) {
      console.log('Camera not found or user not authorized');
      return new Response(JSON.stringify({ error: 'Câmera não encontrada ou sem permissão' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!camera.device_username || !camera.device_password) {
      console.log('Camera missing required credentials');
      return new Response(JSON.stringify({ error: 'Câmera sem credenciais configuradas' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine host: prefer device_ip over serial_number
    const host = camera.device_ip || camera.serial_number;
    
    if (!host) {
      console.log('Camera missing IP or serial number');
      return new Response(JSON.stringify({ error: 'Câmera sem IP ou número de série configurado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stream type: main (subtype=0) for high quality, sub (subtype=1) for low quality
    const subtype = stream_type === 'sub' ? 1 : 0;
    const channel = camera.channel || 1;

    // Generate RTSP URL in Intelbras format
    // Format: rtsp://user:pass@host:554/cam/realmonitor?channel=X&subtype=Y
    const rtspUrl = `rtsp://${encodeURIComponent(camera.device_username)}:${encodeURIComponent(camera.device_password)}@${host}:554/cam/realmonitor?channel=${channel}&subtype=${subtype}`;

    // Also generate alternative formats for different player compatibility
    const rtspUrlAlt = `rtsp://${encodeURIComponent(camera.device_username)}:${encodeURIComponent(camera.device_password)}@${host}:554/h264/ch${channel}/${stream_type === 'sub' ? 'sub' : 'main'}/av_stream`;

    console.log(`Generated stream URL for camera: ${camera.name}`);

    return new Response(JSON.stringify({
      camera_id: camera.id,
      camera_name: camera.name,
      channel: channel,
      stream_type: stream_type,
      is_active: camera.is_active,
      rtsp_url: rtspUrl,
      rtsp_url_alt: rtspUrlAlt,
      note: 'Para visualizar no navegador, é necessário um proxy RTSP-to-HLS/WebRTC como go2rtc ou MediaMTX'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno do servidor';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

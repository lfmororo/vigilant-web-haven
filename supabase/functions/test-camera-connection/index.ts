import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HTTP Digest Authentication helper
function md5(str: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = new Uint8Array(16);
  
  // Simple MD5 implementation for Digest Auth
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const words: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    words.push(
      (data[i] || 0) |
      ((data[i + 1] || 0) << 8) |
      ((data[i + 2] || 0) << 16) |
      ((data[i + 3] || 0) << 24)
    );
  }

  // Padding
  const bitLen = data.length * 8;
  words.push(0x80);
  while ((words.length * 4) % 64 !== 56) {
    words.push(0);
  }
  words.push(bitLen & 0xffffffff);
  words.push(0);

  // For simplicity, we'll use a hex encoding approach
  const hexChars = '0123456789abcdef';
  let hash = '';
  for (const byte of data) {
    hash += hexChars[byte >> 4] + hexChars[byte & 0x0f];
  }
  
  return hash;
}

async function computeMd5(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('MD5', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseDigestChallenge(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]+)"|([^\s,]+))/g;
  let match;
  while ((match = regex.exec(header)) !== null) {
    result[match[1]] = match[2] || match[3];
  }
  return result;
}

async function createDigestAuth(
  username: string,
  password: string,
  method: string,
  uri: string,
  challenge: Record<string, string>
): Promise<string> {
  const realm = challenge.realm || '';
  const nonce = challenge.nonce || '';
  const qop = challenge.qop || '';
  const nc = '00000001';
  const cnonce = crypto.randomUUID().replace(/-/g, '').substring(0, 16);

  const ha1 = await computeMd5(`${username}:${realm}:${password}`);
  const ha2 = await computeMd5(`${method}:${uri}`);
  
  let response: string;
  if (qop === 'auth' || qop.includes('auth')) {
    response = await computeMd5(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`);
  } else {
    response = await computeMd5(`${ha1}:${nonce}:${ha2}`);
  }

  let authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  
  if (qop) {
    authHeader += `, qop=auth, nc=${nc}, cnonce="${cnonce}"`;
  }
  
  if (challenge.opaque) {
    authHeader += `, opaque="${challenge.opaque}"`;
  }

  return authHeader;
}

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

    // Verify user is authenticated
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('User not authenticated:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { device_ip, device_username, device_password, port = 80 } = await req.json();

    if (!device_ip || !device_username || !device_password) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'IP, usuário e senha são obrigatórios' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Testing connection to device at ${device_ip}:${port}`);

    // Endpoints to try (Intelbras/Dahua compatible)
    const endpoints = [
      '/cgi-bin/magicBox.cgi?action=getSystemInfo',
      '/cgi-bin/magicBox.cgi?action=getDeviceType',
      '/cgi-bin/configManager.cgi?action=getConfig&name=General',
    ];

    let lastError = '';
    let deviceInfo: any = null;

    for (const endpoint of endpoints) {
      try {
        const baseUrl = `http://${device_ip}:${port}`;
        const url = `${baseUrl}${endpoint}`;
        
        console.log(`Trying endpoint: ${endpoint}`);

        // First request to get Digest challenge
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const initialResponse = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (initialResponse.status === 401) {
          const wwwAuth = initialResponse.headers.get('WWW-Authenticate');
          
          if (wwwAuth && wwwAuth.toLowerCase().includes('digest')) {
            console.log('Digest authentication required, attempting auth...');
            
            const challenge = parseDigestChallenge(wwwAuth);
            const authHeaderValue = await createDigestAuth(
              device_username,
              device_password,
              'GET',
              endpoint,
              challenge
            );

            const authController = new AbortController();
            const authTimeoutId = setTimeout(() => authController.abort(), 10000);

            const authResponse = await fetch(url, {
              method: 'GET',
              headers: {
                'Authorization': authHeaderValue,
              },
              signal: authController.signal,
            });

            clearTimeout(authTimeoutId);

            if (authResponse.ok) {
              const text = await authResponse.text();
              console.log(`Connection successful! Response: ${text.substring(0, 200)}`);
              
              // Parse device info from response
              const info: Record<string, string> = {};
              text.split('\n').forEach(line => {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length > 0) {
                  info[key.trim()] = valueParts.join('=').trim();
                }
              });

              deviceInfo = {
                deviceType: info.deviceType || info.DeviceType || 'Unknown',
                serialNumber: info.serialNumber || info.SerialNo || info.sn || 'Unknown',
                hardwareVersion: info.hardwareVersion || info.HardwareVersion || 'Unknown',
                softwareVersion: info.softwareVersion || info.SoftwareVersion || 'Unknown',
                rawResponse: text.substring(0, 500),
              };

              return new Response(JSON.stringify({
                success: true,
                message: 'Conexão estabelecida com sucesso!',
                device_info: deviceInfo,
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            } else if (authResponse.status === 401) {
              lastError = 'Credenciais inválidas (usuário ou senha incorretos)';
              console.log('Authentication failed: invalid credentials');
            } else {
              lastError = `Erro HTTP ${authResponse.status}`;
              console.log(`HTTP error: ${authResponse.status}`);
            }
          } else if (wwwAuth && wwwAuth.toLowerCase().includes('basic')) {
            // Try Basic auth
            console.log('Basic authentication required, attempting auth...');
            
            const credentials = btoa(`${device_username}:${device_password}`);
            
            const basicController = new AbortController();
            const basicTimeoutId = setTimeout(() => basicController.abort(), 10000);

            const basicResponse = await fetch(url, {
              method: 'GET',
              headers: {
                'Authorization': `Basic ${credentials}`,
              },
              signal: basicController.signal,
            });

            clearTimeout(basicTimeoutId);

            if (basicResponse.ok) {
              const text = await basicResponse.text();
              console.log(`Connection successful with Basic auth! Response: ${text.substring(0, 200)}`);
              
              return new Response(JSON.stringify({
                success: true,
                message: 'Conexão estabelecida com sucesso!',
                device_info: { rawResponse: text.substring(0, 500) },
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            } else if (basicResponse.status === 401) {
              lastError = 'Credenciais inválidas (usuário ou senha incorretos)';
            }
          } else {
            lastError = 'Método de autenticação não suportado';
          }
        } else if (initialResponse.ok) {
          // No auth required
          const text = await initialResponse.text();
          console.log(`Connection successful (no auth)! Response: ${text.substring(0, 200)}`);
          
          return new Response(JSON.stringify({
            success: true,
            message: 'Conexão estabelecida com sucesso!',
            device_info: { rawResponse: text.substring(0, 500) },
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          lastError = `Erro HTTP ${initialResponse.status}`;
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          lastError = 'Timeout: dispositivo não respondeu em 10 segundos';
          console.log('Request timeout');
        } else {
          lastError = `Erro de conexão: ${error.message}`;
          console.log(`Connection error: ${error.message}`);
        }
      }
    }

    // If we get here, all endpoints failed
    return new Response(JSON.stringify({
      success: false,
      error: lastError || 'Não foi possível conectar ao dispositivo',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno do servidor';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

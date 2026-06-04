import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface TestBody {
  username?: string;
  password?: string;
  client_id?: string;
  client_secret?: string;
  region?: 'us' | 'eu';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as TestBody;
    const { username, password, client_id, client_secret } = body;
    const region = body.region === 'eu' ? 'eu.gdms.cloud' : 'www.gdms.cloud';

    if (!username || !password || !client_id || !client_secret) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Informe usuário, senha, Client ID e Client Secret do GDMS.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const params = new URLSearchParams({
      grant_type: 'password',
      username,
      password,
      client_id,
      client_secret,
    });
    const url = `https://${region}/oapi/oauth/token?${params.toString()}`;

    const started = Date.now();
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const elapsed = Date.now() - started;

    let payload: any = null;
    const text = await resp.text();
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }

    const accessToken = payload?.access_token || payload?.data?.access_token;

    if (resp.ok && accessToken) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Conexão estabelecida com sucesso com a API GDMS.',
          latency_ms: elapsed,
          token_type: payload?.token_type || 'bearer',
          expires_in: payload?.expires_in ?? null,
          region,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const apiErr =
      payload?.error_description ||
      payload?.error ||
      payload?.msg ||
      payload?.message ||
      `HTTP ${resp.status}`;

    return new Response(
      JSON.stringify({
        success: false,
        error: `Falha na autenticação GDMS: ${apiErr}`,
        latency_ms: elapsed,
        http_status: resp.status,
        details: payload,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Erro ao contatar GDMS: ${err?.message || String(err)}`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

/**
 * Camada de integração com a Evolution API.
 *
 * Motivação: o projeto inteiro foi escrito contra a antiga API (uazapi), que usava
 * os endpoints `/send/text`, `/send/media` e `/send/menu` com o header `token`.
 * Em vez de reescrever ~16 Edge Functions (alto risco de regressão), esta camada
 * expõe `waFetch`, que tem a MESMA assinatura de `fetch` e traduz a chamada para
 * os endpoints equivalentes da Evolution API:
 *
 *   /send/text   -> POST {base}/message/sendText/{instance}
 *   /send/media  -> POST {base}/message/sendMedia/{instance}
 *   /send/menu   -> POST {base}/message/sendText/{instance}  (botões viram links)
 *
 * Documentação: https://docs.evolutionfoundation.com.br/evolution-api/index
 *
 * Configuração (tabela public.system_settings):
 *   whatsapp_api_url   -> URL base da Evolution API (ex.: https://evo.seudominio.com.br)
 *   whatsapp_api_token -> API Key (header `apikey`)
 *   whatsapp_instance  -> nome da instância (ex.: suporte)
 *   whatsapp_enabled   -> "true" | "false"
 */

import { createClient } from "npm:@supabase/supabase-js@2";

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instance: string;
  enabled: boolean;
}

let cachedInstance: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

/** Lê o nome da instância configurado, com cache curto para evitar I/O repetido. */
async function resolveInstance(): Promise<string> {
  const now = Date.now();
  if (cachedInstance && now - cachedAt < CACHE_TTL_MS) return cachedInstance;

  const envInstance = Deno.env.get("EVOLUTION_INSTANCE");
  if (envInstance) {
    cachedInstance = envInstance;
    cachedAt = now;
    return envInstance;
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin
      .from("system_settings")
      .select("value")
      .eq("key", "whatsapp_instance")
      .maybeSingle();
    cachedInstance = (data?.value || "").trim() || "default";
  } catch (err) {
    console.error("[evolution] falha ao ler whatsapp_instance:", err);
    cachedInstance = "default";
  }
  cachedAt = now;
  return cachedInstance!;
}

/** Lê toda a configuração da Evolution API a partir de system_settings. */
export async function getEvolutionConfig(
  settings?: Record<string, string>,
): Promise<EvolutionConfig> {
  let s = settings;
  if (!s) {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin.from("system_settings").select("key, value");
    s = {};
    data?.forEach((r: { key: string; value: string | null }) => {
      s![r.key] = r.value || "";
    });
  }
  return {
    baseUrl: (s.whatsapp_api_url || "").replace(/\/+$/, ""),
    apiKey: s.whatsapp_api_token || "",
    instance: (s.whatsapp_instance || "").trim() || "default",
    enabled: s.whatsapp_enabled === "true",
  };
}

/** Normaliza destinatário: grupos mantêm o sufixo, números ficam só com dígitos. */
export function toEvolutionNumber(raw: string): string {
  const value = String(raw || "").trim();
  if (value.includes("@")) return value; // grupo (@g.us) ou jid completo
  return value.replace(/\D/g, "");
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function headerValue(headers: HeadersInit | undefined, name: string): string {
  if (!headers) return "";
  const h = new Headers(headers as HeadersInit);
  return h.get(name) || "";
}

/**
 * Substituto de `fetch` para as chamadas de WhatsApp.
 * Aceita as URLs no formato antigo e as converte para a Evolution API.
 * Qualquer URL não reconhecida é repassada para o `fetch` nativo.
 */
export async function waFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = String(input);
  const match = url.match(/^(.*?)\/send\/(text|media|menu)\/?$/);
  if (!match) return fetch(input as string, init);

  const base = match[1].replace(/\/+$/, "");
  const kind = match[2];
  const apiKey =
    headerValue(init?.headers, "token") ||
    headerValue(init?.headers, "apikey") ||
    Deno.env.get("EVOLUTION_API_KEY") ||
    "";
  const instance = await resolveInstance();

  let payload: Record<string, unknown> = {};
  try {
    payload = init?.body ? JSON.parse(String(init.body)) : {};
  } catch {
    return jsonResponse(400, { error: "corpo inválido para envio WhatsApp" });
  }

  const number = toEvolutionNumber(String(payload.number ?? ""));
  if (!number) return jsonResponse(400, { error: "destinatário ausente" });

  let endpoint = "";
  let body: Record<string, unknown> = {};

  if (kind === "text") {
    endpoint = `${base}/message/sendText/${encodeURIComponent(instance)}`;
    body = {
      number,
      text: String(payload.text ?? ""),
      linkPreview: payload.linkPreview !== false,
    };
  } else if (kind === "media") {
    const mediatype = String(payload.type || "document");
    endpoint = `${base}/message/sendMedia/${encodeURIComponent(instance)}`;
    body = {
      number,
      mediatype,
      media: String(payload.file ?? payload.media ?? ""),
      fileName: String(payload.docName ?? payload.fileName ?? "arquivo"),
      caption: String(payload.text ?? payload.caption ?? ""),
    };
  } else if (String(payload.type || "") === "poll") {
    // Enquete de satisfação -> POST /message/sendPoll/{instance}
    const values = (Array.isArray(payload.choices) ? payload.choices : []).map((c) =>
      String(c).split("|")[0],
    );
    endpoint = `${base}/message/sendPoll/${encodeURIComponent(instance)}`;
    body = {
      number,
      name: String(payload.text ?? "Enquete"),
      selectableCount: Number(payload.selectableCount ?? 1),
      values,
    };
  } else {
    // A Evolution API não tem paridade de "menu/botões" com CTA de link em todas
    // as versões, então os botões viram um texto com os links (comportamento estável).
    const choices = Array.isArray(payload.choices)
      ? (payload.choices as string[])
      : [];
    const lines = [String(payload.text ?? "")];
    for (const choice of choices) {
      const [label, link] = String(choice).split("|");
      lines.push("", link ? `👉 ${label}: ${link}` : `• ${label}`);
    }
    if (payload.footerText) lines.push("", `_${payload.footerText}_`);
    endpoint = `${base}/message/sendText/${encodeURIComponent(instance)}`;
    body = { number, text: lines.join("\n"), linkPreview: false };
  }


  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`[evolution] erro de rede em ${endpoint}:`, err);
    return jsonResponse(502, { error: String(err) });
  }
}

/** Envio direto de texto (uso novo, sem depender do formato antigo). */
export async function sendText(
  cfg: EvolutionConfig,
  number: string,
  text: string,
  linkPreview = false,
): Promise<boolean> {
  if (!cfg.enabled || !cfg.baseUrl || !cfg.apiKey) return false;
  const resp = await fetch(
    `${cfg.baseUrl}/message/sendText/${encodeURIComponent(cfg.instance)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
      body: JSON.stringify({
        number: toEvolutionNumber(number),
        text,
        linkPreview,
      }),
    },
  );
  if (!resp.ok) {
    console.error(`[evolution] envio falhou (${resp.status}):`, await resp.text());
    return false;
  }
  return true;
}

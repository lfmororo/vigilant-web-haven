/**
 * IA dos chamados (classificar, resumir, sugerir respostas, relatórios).
 *
 * - Fora da Lovable (VPS): usa a API do Google Gemini direto, no formato compatível com OpenAI,
 *   com a chave GEMINI_API_KEY (Google AI Studio). AI_MODEL força um modelo para todas as chamadas.
 * - Na Lovable: continua usando o gateway da Lovable com LOVABLE_API_KEY.
 */
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const useGemini = () => !!Deno.env.get("GEMINI_API_KEY");

/** Chave da IA configurada (Gemini ou Lovable), ou undefined. */
export function aiKey(): string | undefined {
  return Deno.env.get("GEMINI_API_KEY") || Deno.env.get("LOVABLE_API_KEY") || undefined;
}

export function aiChatUrl(): string {
  return useGemini() ? GEMINI_URL : LOVABLE_URL;
}

/** "google/gemini-2.5-flash" → "gemini-2.5-flash" na API do Google (ou AI_MODEL, se definido). */
export function aiModel(model: string): string {
  if (!useGemini()) return model;
  return Deno.env.get("AI_MODEL") || model.replace(/^google\//, "");
}

export const AI_NOT_CONFIGURED = "IA não configurada: defina GEMINI_API_KEY (ou LOVABLE_API_KEY na Lovable)";

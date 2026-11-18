// Quem está chamando a função: o próprio servidor (crons e outras funções, com a
// service_role) ou um usuário logado no painel. Usado pelas funções marcadas com
// verify_jwt = false no config.toml, que sem isso aceitariam chamadas de qualquer pessoa.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

function tokenFrom(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

/** true quando a chamada vem do próprio servidor (cron, outra função) com a chave service_role. */
export function isServiceRole(req: Request): boolean {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!key) return false;
  return tokenFrom(req) === key || (req.headers.get("apikey") || "") === key;
}

export interface Caller {
  userId: string;
  role: string | null; // admin | technician | client | null
  /** cliente Supabase com o login do usuário: as regras do banco (RLS) valem para ele */
  db: SupabaseClient;
}

/** Usuário logado no painel, ou null. */
export async function getCaller(req: Request): Promise<Caller | null> {
  const token = tokenFrom(req);
  if (!token || token === Deno.env.get("SUPABASE_ANON_KEY")) return null;
  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", data.user.id);
  const list = (roles || []).map((r: { role: string }) => r.role);
  const role = list.includes("admin") ? "admin" : list.includes("technician") ? "technician" : list[0] ?? null;
  return { userId: data.user.id, role, db };
}

/** O usuário enxerga o chamado? (decidido pelas regras do banco, como no painel) */
export async function canSeeTicket(caller: Caller, ticketId: string): Promise<boolean> {
  if (!ticketId) return false;
  const { data } = await caller.db.from("tickets").select("id").eq("id", ticketId).maybeSingle();
  return !!data;
}

export function denied(cors: Record<string, string>, status = 401, msg = "Não autorizado") {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

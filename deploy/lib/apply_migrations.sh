#!/usr/bin/env bash
# Aplica as migrações do repositório que ainda não rodaram neste banco.
#   apply_migrations.sh <repo_dir> [--baseline]
# --baseline: marca como aplicadas as migrações de supabase/migrations (usado após restaurar o backup
#             da Lovable, que já contém essas mudanças). As de drizzle/migrations são testadas uma a uma:
#             se o objeto "já existe", ficam marcadas como aplicadas.
set -euo pipefail
REPO="${1:?repo}"; MODE="${2:-}"
PSQL=(docker exec -i supabase-db psql -X -q -v ON_ERROR_STOP=1 -U supabase_admin -d postgres)

"${PSQL[@]}" -c "CREATE SCHEMA IF NOT EXISTS _vigilant; CREATE TABLE IF NOT EXISTS _vigilant.migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now(), note text);" >/dev/null

applied() { "${PSQL[@]}" -A -t -c "SELECT 1 FROM _vigilant.migrations WHERE name = '$1'" | grep -q 1; }
mark() { "${PSQL[@]}" -c "INSERT INTO _vigilant.migrations(name, note) VALUES ('$1', '$2') ON CONFLICT DO NOTHING" >/dev/null; }

mapfile -t SUPA < <(ls "$REPO"/supabase/migrations/*.sql 2>/dev/null | sort)
mapfile -t DRIZ < <(ls "$REPO"/drizzle/migrations/*.sql 2>/dev/null | sort)

if [ "$MODE" = "--baseline" ]; then
  for f in "${SUPA[@]}"; do mark "supabase/$(basename "$f")" "baseline (backup da Lovable)"; done
fi

run_one() {
  local key="$1" file="$2" out
  applied "$key" && return 0
  # Em uma transação: se falhar por "já existe", a mudança já está no banco.
  if out=$( { echo "BEGIN; SET ROLE postgres;"; cat "$file"; echo "; COMMIT;"; } | "${PSQL[@]}" 2>&1 ); then
    mark "$key" "aplicada"; echo "  ✔ $key"
  elif echo "$out" | grep -qiE "already exists|já existe"; then
    mark "$key" "já existia"; echo "  = $key (já estava no banco)"
  else
    echo "  ✖ $key"; echo "$out" | tail -5 | sed 's/^/      /'; return 1
  fi
}

for f in "${SUPA[@]}"; do run_one "supabase/$(basename "$f")" "$f"; done
for f in "${DRIZ[@]}"; do run_one "drizzle/$(basename "$f")" "$f"; done
"${PSQL[@]}" -c "NOTIFY pgrst, 'reload schema';" >/dev/null

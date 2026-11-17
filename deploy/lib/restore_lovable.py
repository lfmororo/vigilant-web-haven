#!/usr/bin/env python3
"""
Restaura o backup exportado da Lovable Cloud (Cloud > Overview > Advanced settings > Export,
arquivo pg_dump formato custom) no Supabase auto-hospedado.

Ordem (cada etapa tolera diferenças de versão entre a Lovable e o Supabase local):
  1. auth.users / auth.identities — só as colunas que existem nos dois lados (mantém as senhas).
  2. schema public completo (tabelas, dados, funções, políticas RLS, grants, publicação realtime).
  3. gatilhos em auth.* e políticas de storage.objects que o projeto criou.
  4. storage.buckets (os arquivos são copiados depois, por pull_storage.py).
  5. tarefas agendadas (pg_cron) reapontadas para o novo endereço e a nova chave.

Uso (dentro do container do banco ou com as variáveis PG* apontando para ele):
  restore_lovable.py --dump /tmp/lovable.dump --old-url https://xxxx.supabase.co \
      --cron-url http://kong:8000 --cron-key <SERVICE_ROLE_KEY> [--db postgres] [--user supabase_admin]
"""
import argparse
import json
import os
import re
import shlex
import subprocess
import sys

AUTH_TABLES = ["users", "identities"]
STAGE = "_lovable_import"


PREFIX = []  # ex.: ["docker", "exec", "-i", "supabase-db"] — psql/pg_restore rodam dentro do container


def sh(cmd, input_text=None, check=True):
    cmd = PREFIX + cmd
    r = subprocess.run(cmd, input=input_text, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise SystemExit(f"falhou: {' '.join(cmd)}\n{r.stderr[-3000:]}")
    return r


class DB:
    def __init__(self, db, user):
        self.base = ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-q", "-d", db, "-U", user]

    def run(self, sql, check=True):
        return sh(self.base + ["-c", sql], check=check)

    def rows(self, sql):
        r = sh(self.base + ["-A", "-t", "-F", "\t", "-c", sql])
        return [l.split("\t") for l in r.stdout.splitlines() if l.strip()]

    def script(self, sql, check=True):
        return sh(self.base, input_text=sql, check=check)


def dump_sql(dump, *args):
    """Saída SQL (texto) de parte do backup."""
    r = sh(["pg_restore", "-f", "-", *args, dump], check=False)
    return r.stdout


COPY_RE = re.compile(r'^COPY (?:"?([\w]+)"?)\.(?:"?([\w]+)"?) \((.*)\) FROM stdin;$')


def copy_blocks(sql_text):
    """Extrai blocos COPY: {(schema, tabela): (colunas, linhas_texto)}."""
    out = {}
    lines = sql_text.split("\n")
    i = 0
    while i < len(lines):
        m = COPY_RE.match(lines[i])
        if not m:
            i += 1
            continue
        schema, table, cols = m.group(1), m.group(2), [c.strip().strip('"') for c in m.group(3).split(",")]
        j = i + 1
        body = []
        while j < len(lines) and lines[j] != "\\.":
            body.append(lines[j])
            j += 1
        out[(schema, table)] = (cols, body)
        i = j + 1
    return out


def target_columns(db, schema, table):
    """Colunas graváveis do destino com o tipo (sem colunas geradas)."""
    rows = db.rows(
        f"""SELECT a.attname, format_type(a.atttypid, a.atttypmod)
            FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = '{schema}' AND c.relname = '{table}' AND a.attnum > 0 AND NOT a.attisdropped
              AND a.attgenerated = '' AND a.attidentity = ''"""
    )
    return {r[0]: r[1] for r in rows}


def import_table(db, schema, table, cols, body):
    """Carrega o COPY numa tabela de texto e insere só as colunas em comum, com conversão de tipo."""
    if not body:
        return 0, []
    tcols = target_columns(db, schema, table)
    if not tcols:
        print(f"  ! {schema}.{table} não existe no destino — ignorado")
        return 0, []
    common = [c for c in cols if c in tcols]
    skipped = [c for c in cols if c not in tcols]
    stage = f'{STAGE}."{schema}_{table}"'
    db.run(f"CREATE SCHEMA IF NOT EXISTS {STAGE}; DROP TABLE IF EXISTS {stage};")
    db.run(f"CREATE TABLE {stage} ({', '.join(f'{chr(34)}{c}{chr(34)} text' for c in cols)});")
    copy = f"COPY {stage} ({', '.join(f'{chr(34)}{c}{chr(34)}' for c in cols)}) FROM stdin;\n" + "\n".join(body) + "\n\\.\n"
    db.script(copy)
    sel = ", ".join(f'"{c}"::{tcols[c]}' for c in common)
    ins = ", ".join(f'"{c}"' for c in common)
    r = db.rows(
        f"WITH ins AS (INSERT INTO {schema}.\"{table}\" ({ins}) SELECT {sel} FROM {stage} "
        f"ON CONFLICT DO NOTHING RETURNING 1) SELECT count(*) FROM ins;"
    )
    return int(r[0][0]) if r else 0, skipped


def toc_filtered(dump, predicate):
    lst = sh(["pg_restore", "-l", dump]).stdout.splitlines()
    keep = [l for l in lst if not l.startswith(";") and predicate(l)]
    return "\n".join(keep) + "\n", keep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", required=True)
    ap.add_argument("--db", default="postgres")
    ap.add_argument("--user", default="supabase_admin")
    ap.add_argument("--role", default="postgres", help="dono dos objetos restaurados no schema public")
    ap.add_argument("--old-url", required=True)
    ap.add_argument("--cron-url", required=True, help="endereço interno do gateway visto pelo banco (ex.: http://kong:8000)")
    ap.add_argument("--cron-key", required=True)
    ap.add_argument("--report", default="restore-report.json")
    ap.add_argument("--exec", default="", help='prefixo dos comandos, ex.: "docker exec -i supabase-db"')
    a = ap.parse_args()
    PREFIX.extend(shlex.split(a.exec))

    db = DB(a.db, a.user)
    report = {"auth": {}, "public_errors": [], "auth_triggers": [], "storage_policies": [], "buckets": 0, "crons": []}

    # Já restaurado?
    if db.rows("SELECT to_regclass('public.profiles') IS NOT NULL")[0][0] == "t":
        cnt = db.rows("SELECT count(*) FROM public.profiles")[0][0]
        if cnt != "0" and not os.environ.get("FORCE_RESTORE"):
            raise SystemExit("O schema public já tem dados (public.profiles). Para restaurar de novo use um banco limpo ou FORCE_RESTORE=1.")

    print("1/5 Usuários do login (auth)…")
    auth_sql = dump_sql(a.dump, "--data-only", "-n", "auth")
    blocks = copy_blocks(auth_sql)
    for t in AUTH_TABLES:
        if ("auth", t) not in blocks:
            print(f"  ! auth.{t} não está no backup")
            report["auth"][t] = "ausente no backup"
            continue
        cols, body = blocks[("auth", t)]
        n, skipped = import_table(db, "auth", t, cols, body)
        report["auth"][t] = {"importados": n, "no_backup": len(body), "colunas_ignoradas": skipped}
        print(f"  auth.{t}: {n} de {len(body)}" + (f" (colunas ignoradas: {', '.join(skipped)})" if skipped else ""))

    print("2/5 Tabelas, dados, funções e políticas do sistema (public)…")
    r = sh(["pg_restore", "-d", a.db, "-U", a.user, "--no-owner", f"--role={a.role}", "-n", "public", a.dump], check=False)
    errs = [l for l in r.stderr.splitlines() if "error" in l.lower()]
    report["public_errors"] = errs[:200]
    print(f"  concluído ({len(errs)} aviso(s)/erro(s) — veja {a.report})")

    print("3/5 Gatilhos do login e políticas dos arquivos…")
    lst, kept = toc_filtered(a.dump, lambda l: (" TRIGGER auth " in l) or (" POLICY storage " in l))
    if kept:
        r = sh(["pg_restore", "-d", a.db, "-U", a.user, "--no-owner", "-L", "/dev/stdin", a.dump], input_text=lst, check=False)
        report["auth_triggers"] = [l.split(" TRIGGER auth ")[1] for l in kept if " TRIGGER auth " in l]
        report["storage_policies"] = [l.split(" POLICY storage ")[1] for l in kept if " POLICY storage " in l]
        for l in r.stderr.splitlines():
            if "error" in l.lower() and "already exists" not in l:
                report["public_errors"].append("[auth/storage] " + l)
    print(f"  {len(report['auth_triggers'])} gatilho(s), {len(report['storage_policies'])} política(s)")

    print("4/5 Buckets de arquivos…")
    st = copy_blocks(dump_sql(a.dump, "--data-only", "-n", "storage", "-t", "buckets", "-t", "objects"))
    if ("storage", "buckets") in st:
        cols, body = st[("storage", "buckets")]
        n, _ = import_table(db, "storage", "buckets", cols, body)
        report["buckets"] = n
        print(f"  {n} bucket(s)")
    if ("storage", "objects") in st:
        cols, body = st[("storage", "objects")]
        # Lista para o pull_storage.py (os arquivos em si vêm do endereço antigo).
        db.run(f"CREATE SCHEMA IF NOT EXISTS {STAGE}; DROP TABLE IF EXISTS {STAGE}.storage_objects;")
        db.run(f"CREATE TABLE {STAGE}.storage_objects ({', '.join(f'{chr(34)}{c}{chr(34)} text' for c in cols)});")
        db.script(f"COPY {STAGE}.storage_objects ({', '.join(f'{chr(34)}{c}{chr(34)}' for c in cols)}) FROM stdin;\n" + "\n".join(body) + "\n\\.\n")
        report["storage_objects"] = len(body)
        print(f"  {len(body)} arquivo(s) para copiar")

    print("5/5 Tarefas agendadas (pg_cron)…")
    db.run("CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;", check=False)
    db.run("CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;", check=False)
    cron = copy_blocks(dump_sql(a.dump, "--data-only", "-n", "cron", "-t", "job"))
    jobs = []
    if ("cron", "job") in cron:
        cols, body = cron[("cron", "job")]
        idx = {c: i for i, c in enumerate(cols)}
        for line in body:
            f = line.split("\t")
            unesc = lambda s: s.replace("\\n", "\n").replace("\\t", "\t").replace("\\r", "\r").replace("\\\\", "\\")
            name = unesc(f[idx["jobname"]]) if "jobname" in idx and f[idx["jobname"]] != "\\N" else None
            jobs.append({"name": name, "schedule": unesc(f[idx["schedule"]]), "command": unesc(f[idx["command"]]),
                         "active": f[idx["active"]] == "t" if "active" in idx else True})
    jwt_re = re.compile(r"eyJ[\w-]+\.[\w-]+\.[\w-]+")
    old = a.old_url.rstrip("/")
    for j in jobs:
        cmd = j["command"].replace(old, a.cron_url.rstrip("/"))
        cmd = jwt_re.sub(a.cron_key, cmd)  # chave antiga (anon/service) → service_role nova
        name = j["name"] or f"job_{abs(hash(j['command'])) % 100000}"
        db.run(f"SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = $q${name}$q$;", check=False)
        ok = db.run(f"SELECT cron.schedule($q${name}$q$, $q${j['schedule']}$q$, $cmd${cmd}$cmd$);", check=False).returncode == 0
        if ok and not j["active"]:
            db.run(f"UPDATE cron.job SET active = false WHERE jobname = $q${name}$q$;", check=False)
        report["crons"].append({"name": name, "schedule": j["schedule"], "ok": ok, "active": j["active"]})
        print(f"  {'✔' if ok else '✖'} {name} ({j['schedule']})")
    if not jobs:
        print("  nenhuma tarefa no backup — use deploy/sql/crons-padrao.sql")

    db.run("NOTIFY pgrst, 'reload schema';", check=False)
    with open(a.report, "w") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
    print(f"Relatório: {a.report}")


if __name__ == "__main__":
    main()

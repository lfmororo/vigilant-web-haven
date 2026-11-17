#!/usr/bin/env python3
"""
Copia os arquivos do Storage da Lovable Cloud para o Supabase da VPS.

A lista de arquivos vem do backup (tabela _lovable_import.storage_objects, criada por
restore_lovable.py). Cada arquivo é baixado pelo endereço público antigo e enviado à API
de Storage nova com a service_role. Arquivos já copiados são pulados (pode rodar de novo).

Uso: pull_storage.py --old-url https://xxxx.supabase.co --new-url http://127.0.0.1:54321 --key <SERVICE_ROLE_KEY>
     (a lista é lida com: docker exec supabase-db psql ...)
"""
import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor


def list_objects(container, user):
    sql = "SELECT bucket_id, name, coalesce(metadata,'{}') FROM _lovable_import.storage_objects WHERE name NOT LIKE '%.emptyFolderPlaceholder' ORDER BY 1,2"
    r = subprocess.run(["docker", "exec", "-i", container, "psql", "-X", "-A", "-t", "-F", "\t", "-U", user, "-d", "postgres", "-c", sql],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"Não consegui ler a lista de arquivos: {r.stderr}")
    out = []
    for line in r.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) >= 3:
            try:
                meta = json.loads(parts[2])
            except Exception:
                meta = {}
            out.append((parts[0], parts[1], meta))
    return out


def qpath(name):
    return "/".join(urllib.parse.quote(p) for p in name.split("/"))


def copy_one(args, bucket, name, meta):
    path = f"{urllib.parse.quote(bucket)}/{qpath(name)}"
    new_base = args.new_url.rstrip("/")
    hdr = {"Authorization": f"Bearer {args.key}", "apikey": args.key}
    # Já existe?
    try:
        req = urllib.request.Request(f"{new_base}/storage/v1/object/info/{path}", headers=hdr)
        with urllib.request.urlopen(req, timeout=30) as r:
            if r.status == 200:
                return "skip", None
    except urllib.error.HTTPError:
        pass
    except Exception:
        pass
    try:
        with urllib.request.urlopen(f"{args.old_url.rstrip('/')}/storage/v1/object/public/{path}", timeout=120) as r:
            data = r.read()
            ctype = r.headers.get("Content-Type") or meta.get("mimetype") or "application/octet-stream"
    except urllib.error.HTTPError as e:
        return "fail", f"download HTTP {e.code} (bucket privado? veja o guia)"
    except Exception as e:
        return "fail", f"download: {e}"
    try:
        req = urllib.request.Request(f"{new_base}/storage/v1/object/{path}", data=data, method="POST",
                                     headers={**hdr, "Content-Type": meta.get("mimetype") or ctype, "x-upsert": "true",
                                              "cache-control": "max-age=3600"})
        with urllib.request.urlopen(req, timeout=120) as r:
            r.read()
        return "ok", None
    except urllib.error.HTTPError as e:
        return "fail", f"upload HTTP {e.code}: {e.read()[:200]!r}"
    except Exception as e:
        return "fail", f"upload: {e}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--old-url", required=True)
    ap.add_argument("--new-url", required=True)
    ap.add_argument("--key", required=True)
    ap.add_argument("--container", default="supabase-db")
    ap.add_argument("--user", default="supabase_admin")
    a = ap.parse_args()

    objs = list_objects(a.container, a.user)
    print(f"{len(objs)} arquivo(s) na lista")
    counts = {"ok": 0, "skip": 0, "fail": 0}
    fails = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(copy_one, a, b, n, m): (b, n) for b, n, m in objs}
        for i, f in enumerate(futs, 1):
            st, err = f.result()
            counts[st] += 1
            if err:
                fails.append((*futs[f], err))
            if i % 25 == 0 or i == len(objs):
                print(f"  {i}/{len(objs)} — copiados {counts['ok']}, já existiam {counts['skip']}, falhas {counts['fail']}")
    for b, n, e in fails[:50]:
        print(f"  ✖ {b}/{n}: {e}")
    if fails:
        with open("storage-falhas.txt", "w") as fh:
            fh.write("\n".join(f"{b}/{n}\t{e}" for b, n, e in fails))
        print("Lista completa das falhas em storage-falhas.txt")
    sys.exit(1 if counts["fail"] else 0)


if __name__ == "__main__":
    main()

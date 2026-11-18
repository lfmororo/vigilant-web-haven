import { lazy, type ComponentType } from "react";
import { Loader2 } from "lucide-react";

/** Indicador mostrado enquanto o código de uma página é baixado. */
export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

const RELOAD_KEY = "page-chunk-reload";

/**
 * React.lazy com uma proteção: depois de uma atualização na VPS os arquivos antigos deixam
 * de existir, e quem estava com o painel aberto recebe erro ao abrir outra página. Nesse caso
 * a página é recarregada uma vez para buscar a versão nova.
 */
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await load();
      try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* sem sessionStorage */ }
      return mod;
    } catch (err) {
      let reloaded = false;
      try { reloaded = sessionStorage.getItem(RELOAD_KEY) === "1"; sessionStorage.setItem(RELOAD_KEY, "1"); } catch { /* idem */ }
      if (!reloaded) { window.location.reload(); return new Promise<never>(() => {}); }
      throw err;
    }
  });
}

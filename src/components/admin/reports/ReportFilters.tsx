import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, RotateCcw, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  full_name: string;
}

interface ReportFiltersProps {
  clients: Client[];
  clientId: string;
  setClientId: (v: string) => void;
  startDate: Date | undefined;
  setStartDate: (v: Date | undefined) => void;
  endDate: Date | undefined;
  setEndDate: (v: Date | undefined) => void;
  onClear: () => void;
  sectorIds?: string[];
  setSectorIds?: (v: string[]) => void;
}

const ReportFilters = ({
  clients, clientId, setClientId,
  startDate, setStartDate, endDate, setEndDate, onClear,
  sectorIds, setSectorIds,
}: ReportFiltersProps) => {
  const { data: sectors } = useQuery({
    queryKey: ["report-sectors", clientId],
    queryFn: async () => {
      if (clientId === "all") {
        const { data } = await supabase.from("client_sectors").select("id, name, client_id").order("name");
        return data || [];
      }
      const { data } = await supabase.from("client_sectors").select("id, name, client_id").eq("client_id", clientId).order("name");
      return data || [];
    },
  });

  const showSector = !!setSectorIds;

  const toggleSector = (id: string) => {
    if (!setSectorIds || !sectorIds) return;
    if (sectorIds.includes(id)) {
      setSectorIds(sectorIds.filter(s => s !== id));
    } else {
      setSectorIds([...sectorIds, id]);
    }
  };

  const sectorLabel = !sectorIds?.length
    ? "Todos"
    : sectorIds.length === 1
      ? sectors?.find(s => s.id === sectorIds[0])?.name || "1 setor"
      : `${sectorIds.length} setores`;

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4 items-end", showSector ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Cliente</label>
        <Select value={clientId} onValueChange={(v) => {
          setClientId(v);
          if (setSectorIds) setSectorIds([]);
        }}>
          <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showSector && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Setor</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between font-normal">
                <span className="truncate">{sectorLabel}</span>
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2 max-h-60 overflow-auto" align="start">
              {!sectors?.length ? (
                <p className="text-xs text-muted-foreground p-2">Nenhum setor</p>
              ) : (
                sectors.map(s => (
                  <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent rounded cursor-pointer text-sm">
                    <Checkbox
                      checked={sectorIds?.includes(s.id) || false}
                      onCheckedChange={() => toggleSector(s.id)}
                    />
                    {s.name}
                  </label>
                ))
              )}
              {(sectorIds?.length || 0) > 0 && (
                <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setSectorIds?.([])}>
                  Limpar seleção
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Data Inicial</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate ? format(startDate, "dd/MM/yyyy") : "Selecione"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Data Final</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {endDate ? format(endDate, "dd/MM/yyyy") : "Selecione"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={endDate} onSelect={setEndDate} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
      </div>
      <Button variant="ghost" onClick={onClear} className="gap-2">
        <RotateCcw className="w-4 h-4" /> Limpar
      </Button>
    </div>
  );
};

export default ReportFilters;

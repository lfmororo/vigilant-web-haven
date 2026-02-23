import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, RotateCcw } from "lucide-react";
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
  sectorId?: string;
  setSectorId?: (v: string) => void;
}

const ReportFilters = ({
  clients, clientId, setClientId,
  startDate, setStartDate, endDate, setEndDate, onClear,
  sectorId, setSectorId,
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

  const showSector = !!setSectorId;

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4 items-end", showSector ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Cliente</label>
        <Select value={clientId} onValueChange={(v) => {
          setClientId(v);
          if (setSectorId) setSectorId("all");
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
          <Select value={sectorId || "all"} onValueChange={setSectorId!}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {sectors?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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

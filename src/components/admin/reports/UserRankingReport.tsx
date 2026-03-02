import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import ReportFilters from "./ReportFilters";
import RankingReportPrint from "./RankingReportPrint";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Printer } from "lucide-react";

const COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#d97706", "#6366f1", "#e11d48", "#059669"];

const UserRankingReport = () => {
  const [clientId, setClientId] = useState("all");
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [showPrint, setShowPrint] = useState(false);

  const { data: clients } = useQuery({
    queryKey: ["ranking-clients-u"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, full_name").order("full_name");
      return data || [];
    },
  });

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["user-ranking", clientId, sectorIds, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let clientIds: string[] = [];
      if (clientId !== "all") {
        clientIds = [clientId];
        const { data: linked } = await supabase.from("profiles").select("id").eq("parent_client_id", clientId);
        if (linked?.length) clientIds.push(...linked.map(u => u.id));
      }

      let q = supabase.from("tickets").select("id, created_by");

      if (clientIds.length) q = q.in("client_id", clientIds);
      if (sectorIds.length > 0) q = q.in("sector_id", sectorIds);
      if (startDate) q = q.gte("created_at", startDate.toISOString());
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }

      const { data: ticketData } = await q;
      if (!ticketData?.length) return [];

      const creatorIds = [...new Set(ticketData.map(t => t.created_by).filter(Boolean))] as string[];
      const profileMap: Record<string, string> = {};
      if (creatorIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", creatorIds);
        profiles?.forEach(p => { profileMap[p.id] = p.full_name; });
      }

      const map: Record<string, { name: string; count: number }> = {};
      ticketData.forEach((t) => {
        const key = t.created_by || "unknown";
        const name = profileMap[key] || "Desconhecido";
        if (!map[key]) map[key] = { name, count: 0 };
        map[key].count++;
      });
      return Object.values(map).sort((a, b) => b.count - a.count);
    },
  });

  const ranking = tickets || [];

  const clearFilters = () => {
    setClientId("all");
    setSectorIds([]);
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const printFilters = useMemo(() => {
    const clientName = clientId !== "all" && clients
      ? clients.find(c => c.id === clientId)?.full_name || "Todos"
      : "Todos";
    return { clientName, startDate, endDate };
  }, [clientId, startDate, endDate, clients]);

  if (showPrint && ranking.length) {
    return (
      <RankingReportPrint
        title="Ranking de Usuários"
        columnLabel="Usuário"
        ranking={ranking}
        filters={printFilters}
        onClose={() => setShowPrint(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setShowPrint(true)} variant="outline" className="gap-2" disabled={!ranking.length}>
          <Printer className="w-4 h-4" /> Imprimir
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <ReportFilters
            clients={clients || []}
            clientId={clientId} setClientId={(v) => { setClientId(v); setSectorIds([]); }}
            startDate={startDate} setStartDate={setStartDate}
            endDate={endDate} setEndDate={setEndDate}
            onClear={clearFilters}
            sectorIds={sectorIds} setSectorIds={setSectorIds}
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">Carregando...</p>
      ) : !ranking.length ? (
        <p className="text-center text-muted-foreground py-8">Nenhum dado encontrado.</p>
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Usuários com mais chamados abertos</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, ranking.length * 40)}>
                <BarChart data={ranking} layout="vertical" margin={{ left: 120 }}>
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Chamados" radius={[0, 4, 4, 0]}>
                    {ranking.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead className="text-right">Chamados</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono">{i + 1}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-right font-bold">{r.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default UserRankingReport;

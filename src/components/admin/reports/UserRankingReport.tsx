import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import ReportFilters from "./ReportFilters";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#d97706", "#6366f1", "#e11d48", "#059669"];

const UserRankingReport = () => {
  const [clientId, setClientId] = useState("all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const { data: clients } = useQuery({
    queryKey: ["ranking-clients-u"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, full_name").order("full_name");
      return data || [];
    },
  });

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["user-ranking", clientId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let clientIds: string[] = [];
      if (clientId !== "all") {
        clientIds = [clientId];
        const { data: linked } = await supabase.from("profiles").select("id").eq("parent_client_id", clientId);
        if (linked?.length) clientIds.push(...linked.map(u => u.id));
      }

      let q = supabase.from("tickets").select(`
        id, created_by,
        creator:profiles!tickets_created_by_fkey(full_name)
      `);

      if (clientIds.length) q = q.in("client_id", clientIds);
      if (startDate) q = q.gte("created_at", startDate.toISOString());
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }

      const { data } = await q;
      return data || [];
    },
  });

  const ranking = useMemo(() => {
    if (!tickets) return [];
    const map: Record<string, { name: string; count: number }> = {};
    tickets.forEach((t) => {
      const name = (t.creator as any)?.full_name || "Desconhecido";
      const key = t.created_by || "unknown";
      if (!map[key]) map[key] = { name, count: 0 };
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [tickets]);

  const clearFilters = () => {
    setClientId("all");
    setStartDate(undefined);
    setEndDate(undefined);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <ReportFilters
            clients={clients || []}
            clientId={clientId} setClientId={setClientId}
            startDate={startDate} setStartDate={setStartDate}
            endDate={endDate} setEndDate={setEndDate}
            onClear={clearFilters}
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

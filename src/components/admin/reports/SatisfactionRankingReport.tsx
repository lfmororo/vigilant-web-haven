import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import ReportFilters from "./ReportFilters";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Star, TrendingUp, MessageSquare, Award } from "lucide-react";
import { format } from "date-fns";

const COLORS = ["#16a34a", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0891b2", "#d97706", "#6366f1", "#e11d48", "#059669"];

const SatisfactionRankingReport = () => {
  const [clientId, setClientId] = useState("all");
  const [sectorId, setSectorId] = useState("all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const { data: clients } = useQuery({
    queryKey: ["satisfaction-clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, full_name").order("full_name");
      return data || [];
    },
  });

  const { data: ratings, isLoading } = useQuery({
    queryKey: ["satisfaction-ratings", clientId, sectorId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      // If sector filter is active, first get ticket IDs in that sector
      let sectorTicketIds: string[] | null = null;
      if (sectorId !== "all") {
        const { data: sectorTickets } = await supabase.from("tickets").select("id").eq("sector_id", sectorId);
        sectorTicketIds = sectorTickets?.map(t => t.id) || [];
        if (!sectorTicketIds.length) return { ratings: [], techRanking: [], metrics: { avg: 0, total: 0, withComment: 0 } };
      }

      let query = supabase
        .from("ticket_ratings")
        .select("id, rating, comment, rated_at, technician_id, client_id, ticket_id")
        .not("rating", "is", null);

      if (clientId !== "all") query = query.eq("client_id", clientId);
      if (sectorTicketIds) query = query.in("ticket_id", sectorTicketIds);
      if (startDate) query = query.gte("rated_at", startDate.toISOString());
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte("rated_at", end.toISOString());
      }

      const { data } = await query;
      if (!data?.length) return { ratings: [], techRanking: [], metrics: { avg: 0, total: 0, withComment: 0 } };

      // Fetch technician names
      const techIds = [...new Set(data.map(r => r.technician_id).filter(Boolean))] as string[];
      const techMap: Record<string, string> = {};
      if (techIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", techIds);
        profiles?.forEach(p => { techMap[p.id] = p.full_name; });
      }

      // Fetch ticket info
      const ticketIds = data.map(r => r.ticket_id);
      const ticketMap: Record<string, { ticket_number: number; title: string }> = {};
      if (ticketIds.length) {
        const { data: tickets } = await supabase.from("tickets").select("id, ticket_number, title").in("id", ticketIds);
        tickets?.forEach(t => { ticketMap[t.id] = { ticket_number: t.ticket_number, title: t.title }; });
      }

      // Build technician ranking
      const techStats: Record<string, { name: string; total: number; count: number; ratings: number[] }> = {};
      data.forEach(r => {
        const techId = r.technician_id || "unassigned";
        const name = techMap[techId] || "Não atribuído";
        if (!techStats[techId]) techStats[techId] = { name, total: 0, count: 0, ratings: [] };
        techStats[techId].total += r.rating!;
        techStats[techId].count++;
        techStats[techId].ratings.push(r.rating!);
      });

      const techRanking = Object.values(techStats)
        .map(t => ({ name: t.name, avg: Math.round((t.total / t.count) * 10) / 10, count: t.count }))
        .sort((a, b) => b.avg - a.avg || b.count - a.count);

      const totalRatings = data.length;
      const avgRating = Math.round((data.reduce((s, r) => s + r.rating!, 0) / totalRatings) * 10) / 10;
      const withComment = data.filter(r => r.comment).length;

      const enrichedRatings = data.map(r => ({
        ...r,
        technician_name: techMap[r.technician_id || ""] || "Não atribuído",
        ticket_number: ticketMap[r.ticket_id]?.ticket_number || 0,
        ticket_title: ticketMap[r.ticket_id]?.title || "-",
      })).sort((a, b) => new Date(b.rated_at).getTime() - new Date(a.rated_at).getTime());

      return { ratings: enrichedRatings, techRanking, metrics: { avg: avgRating, total: totalRatings, withComment } };
    },
  });

  const clearFilters = () => {
    setClientId("all");
    setSectorId("all");
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const result = ratings || { ratings: [], techRanking: [], metrics: { avg: 0, total: 0, withComment: 0 } };

  const getRatingColor = (rating: number) => {
    if (rating >= 9) return "text-green-600 bg-green-50";
    if (rating >= 7) return "text-blue-600 bg-blue-50";
    if (rating >= 4) return "text-amber-600 bg-amber-50";
    return "text-red-600 bg-red-50";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <ReportFilters
            clients={clients || []}
            clientId={clientId} setClientId={(v) => { setClientId(v); setSectorId("all"); }}
            startDate={startDate} setStartDate={setStartDate}
            endDate={endDate} setEndDate={setEndDate}
            onClear={clearFilters}
            sectorId={sectorId} setSectorId={setSectorId}
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">Carregando...</p>
      ) : !result.techRanking.length ? (
        <p className="text-center text-muted-foreground py-8">Nenhuma avaliação encontrada.</p>
      ) : (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Nota Média</CardTitle>
                <Star className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{result.metrics.avg}<span className="text-sm text-muted-foreground font-normal">/10</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total de Avaliações</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{result.metrics.total}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Com Comentários</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{result.metrics.withComment}</div></CardContent>
            </Card>
          </div>

          {/* Technician ranking chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Award className="h-4 w-4" /> Ranking de Técnicos por Satisfação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, result.techRanking.length * 50)}>
                <BarChart data={result.techRanking} layout="vertical" margin={{ left: 120 }}>
                  <XAxis type="number" domain={[0, 10]} allowDecimals={true} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => [`${value}/10`, "Média"]} />
                  <Bar dataKey="avg" name="Nota Média" radius={[0, 4, 4, 0]}>
                    {result.techRanking.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Ranking table */}
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead className="text-center">Avaliações</TableHead>
                    <TableHead className="text-center">Nota Média</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.techRanking.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono">{i + 1}</TableCell>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-center">{t.count}</TableCell>
                      <TableCell className="text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm font-bold ${getRatingColor(t.avg)}`}>
                          ⭐ {t.avg}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Recent ratings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Avaliações Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead className="text-center">Nota</TableHead>
                    <TableHead>Comentário</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.ratings.slice(0, 20).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">#{r.ticket_number}</TableCell>
                      <TableCell>{r.technician_name}</TableCell>
                      <TableCell className="text-center">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-sm font-bold ${getRatingColor(r.rating)}`}>
                          {r.rating}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-muted-foreground">
                        {r.comment || "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(r.rated_at), "dd/MM/yy HH:mm")}
                      </TableCell>
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

export default SatisfactionRankingReport;

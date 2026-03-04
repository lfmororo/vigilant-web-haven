import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Search, Filter, Phone, Clock, Hash, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const notificationTypeLabels: Record<string, string> = {
  ticket_opened: "Chamado Aberto",
  ticket_updated: "Atualização",
  ticket_resolved: "Resolvido",
  ticket_closed: "Encerrado",
  technician_assigned: "Técnico Atribuído",
  signature_requested: "Assinatura Solicitada",
};

const notificationTypeColors: Record<string, string> = {
  ticket_opened: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  ticket_updated: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  ticket_resolved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  ticket_closed: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  technician_assigned: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  signature_requested: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const ITEMS_PER_PAGE = 20;

const WhatsAppNotificationsLog = () => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["whatsapp-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_notification_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 30000,
  });

  const filteredLogs = (logs || []).filter((log: any) => {
    const matchesSearch =
      !search ||
      log.recipient_phone?.includes(search) ||
      log.message_preview?.toLowerCase().includes(search.toLowerCase()) ||
      String(log.ticket_number)?.includes(search);
    const matchesType = typeFilter === "all" || log.notification_type === typeFilter;
    const matchesStatus = statusFilter === "all" || log.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  // Reset page when filters change
  const filteredWithReset = useMemo(() => {
    setCurrentPage(1);
    return filteredLogs;
  }, [search, typeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ITEMS_PER_PAGE));
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const stats = {
    total: logs?.length || 0,
    sent: logs?.filter((l: any) => l.status === "sent").length || 0,
    failed: logs?.filter((l: any) => l.status === "failed").length || 0,
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="w-7 h-7 text-green-500" />
            Notificações WhatsApp
          </h1>
          <p className="text-muted-foreground mt-1">Histórico de notificações enviadas via WhatsApp</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total enviadas</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Phone className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.sent}</p>
                <p className="text-xs text-muted-foreground">Sucesso</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <MessageSquare className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.failed}</p>
                <p className="text-xs text-muted-foreground">Falhas</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por telefone, ticket ou mensagem..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {Object.entries(notificationTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="sent">Sucesso</SelectItem>
                  <SelectItem value="failed">Falha</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Histórico de Envios</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="w-full">
              {isLoading ? (
                <div className="flex items-center justify-center p-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma notificação encontrada</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Ticket</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Destinatário</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="min-w-[200px]">Prévia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                     {paginatedLogs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-sm">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </div>
                        </TableCell>
                        <TableCell>
                          {log.ticket_number ? (
                            <div className="flex items-center gap-1">
                              <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="font-medium">{log.ticket_number}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${notificationTypeColors[log.notification_type] || "bg-muted text-muted-foreground"}`}>
                            {notificationTypeLabels[log.notification_type] || log.notification_type}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm font-mono">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                            {log.recipient_phone}
                          </div>
                        </TableCell>
                        <TableCell>
                          {log.status === "sent" ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">
                              Enviado
                            </Badge>
                          ) : (
                            <Badge variant="destructive">Falha</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted-foreground truncate max-w-[300px]" title={log.message_preview}>
                            {log.message_preview || "—"}
                          </p>
                          {log.error_message && (
                            <p className="text-xs text-destructive mt-0.5 truncate max-w-[300px]" title={log.error_message}>
                              {log.error_message}
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
            {/* Pagination */}
            {filteredLogs.length > ITEMS_PER_PAGE && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredLogs.length)} de {filteredLogs.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border bg-background hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                  <span className="text-sm text-muted-foreground">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border bg-background hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Próximo <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default WhatsAppNotificationsLog;

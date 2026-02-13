import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig = {
  open: { label: "Aberto", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  in_progress: { label: "Em Andamento", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  waiting_client: { label: "Aguardando Cliente", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  resolved: { label: "Resolvido", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  closed: { label: "Fechado", className: "bg-muted text-muted-foreground border-border" },
};

interface TicketStatusBadgeProps {
  status: string;
}

const TicketStatusBadge = ({ status }: TicketStatusBadgeProps) => {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.open;
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", config.className)}>
      {config.label}
    </Badge>
  );
};

export default TicketStatusBadge;

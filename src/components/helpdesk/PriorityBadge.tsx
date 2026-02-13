import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const priorityConfig = {
  low: { label: "Baixa", className: "bg-muted text-muted-foreground border-border" },
  medium: { label: "Média", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  high: { label: "Alta", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  urgent: { label: "Urgente", className: "bg-destructive/20 text-destructive border-destructive/30" },
};

interface PriorityBadgeProps {
  priority: string;
}

const PriorityBadge = ({ priority }: PriorityBadgeProps) => {
  const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.medium;
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", config.className)}>
      {config.label}
    </Badge>
  );
};

export default PriorityBadge;

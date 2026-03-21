import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";

interface NotificationSetting {
  key: string;
  label: string;
  description: string;
  category: "ticket" | "automated" | "report";
}

const NOTIFICATION_SETTINGS: NotificationSetting[] = [
  { key: "notif_ticket_opened", label: "Chamado Aberto", description: "Notificar quando um novo chamado for criado", category: "ticket" },
  { key: "notif_ticket_updated", label: "Chamado Atualizado", description: "Notificar quando houver atualização em um chamado", category: "ticket" },
  { key: "notif_ticket_resolved", label: "Chamado Resolvido", description: "Notificar quando um chamado for resolvido", category: "ticket" },
  { key: "notif_ticket_closed", label: "Chamado Encerrado", description: "Notificar quando um chamado for encerrado", category: "ticket" },
  { key: "notif_technician_assigned", label: "Técnico Atribuído", description: "Notificar quando um técnico for atribuído a um chamado", category: "ticket" },
  { key: "notif_signature_requested", label: "Assinatura Solicitada", description: "Notificar quando uma assinatura for solicitada", category: "ticket" },
  { key: "notif_out_of_hours", label: "Fora do Horário", description: "Notificar o cliente quando abrir chamado fora do expediente", category: "automated" },
  { key: "notif_satisfaction_survey", label: "Pesquisa de Satisfação", description: "Enviar pesquisa de satisfação ao encerrar chamado", category: "automated" },
  { key: "notif_daily_summary", label: "Resumo Diário", description: "Enviar resumo diário administrativo de chamados", category: "report" },
  { key: "notif_stale_ticket_alert", label: "Chamados Parados", description: "Alertar sobre chamados sem atualização há muito tempo", category: "report" },
  { key: "notif_pending_technician_summary", label: "Pendências do Técnico", description: "Enviar resumo de chamados pendentes ao técnico", category: "report" },
  { key: "notif_mikrotik_alert", label: "Alerta Mikrotik", description: "Enviar alertas de mudanças de status e erros nos dispositivos Mikrotik", category: "automated" },
];

const CATEGORIES = [
  { key: "ticket" as const, title: "Eventos de Chamado", description: "Notificações enviadas em tempo real conforme ações nos chamados" },
  { key: "automated" as const, title: "Automáticas", description: "Notificações disparadas automaticamente pelo sistema" },
  { key: "report" as const, title: "Relatórios e Resumos", description: "Envios periódicos de relatórios e alertas" },
];

interface Props {
  settings: any[] | undefined;
  saveMutation: any;
  user: any;
}

export default function NotificationsTab({ settings, saveMutation, user }: Props) {
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings) {
      const map: Record<string, string> = {};
      settings.forEach((s: any) => {
        if (s.key.startsWith("notif_")) map[s.key] = s.value || "true";
      });
      setForm(map);
    }
  }, [settings]);

  const handleToggle = (key: string, checked: boolean) => {
    setForm((prev) => ({ ...prev, [key]: checked ? "true" : "false" }));
  };

  const handleSave = () => {
    const entries = Object.entries(form).map(([key, value]) => ({ key, value }));
    saveMutation.mutate(entries);
  };

  return (
    <div className="space-y-6">
      {CATEGORIES.map((cat) => {
        const items = NOTIFICATION_SETTINGS.filter((n) => n.category === cat.key);
        return (
          <Card key={cat.key}>
            <CardHeader>
              <CardTitle>{cat.title}</CardTitle>
              <CardDescription>{cat.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item) => (
                <div key={item.key} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-medium">{item.label}</Label>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <Switch
                    checked={form[item.key] !== "false"}
                    onCheckedChange={(checked) => handleToggle(item.key, checked)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
      <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Salvar Configurações
      </Button>
    </div>
  );
}

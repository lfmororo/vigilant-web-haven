import { useState, useEffect } from "react";
import NotificationsTab from "@/components/admin/NotificationsTab";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Suspense } from "react";
import { lazyPage, PageLoader } from "@/components/PageLoader";

const ImapAccountsTab = lazyPage(() => import("@/components/admin/settings/ImapAccountsTab"));
const SmtpSettingsTab = lazyPage(() => import("@/components/admin/settings/SmtpSettingsTab"));
const WhatsappSettingsTab = lazyPage(() => import("@/components/admin/settings/WhatsappSettingsTab"));
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Save, Loader2, Mail, Send, TestTube, Inbox, MessageCircle, Plus, Trash2, Edit2, X, Check, Bell } from "lucide-react";

interface ImapAccount {
  id: string;
  label: string;
  host: string;
  port: string;
  username: string;
  password: string;
  client_id: string | null;
  is_active: boolean;
  last_checked_at: string | null;
}

interface ClientProfile {
  id: string;
  full_name: string;
  email: string;
}

const SystemSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // SMTP form state
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("system_settings").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch IMAP accounts
  const saveMutation = useMutation({
    mutationFn: async (entries: { key: string; value: string }[]) => {
      for (const entry of entries) {
        const { error } = await supabase
          .from("system_settings")
          .update({ value: entry.value, updated_at: new Date().toISOString(), updated_by: user?.id })
          .eq("key", entry.key);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      toast({ title: "Configurações salvas com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar configurações", variant: "destructive" });
    },
  });

  // IMAP account mutations

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Configurações do Sistema</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie as configurações de email e notificações do sistema.
          </p>
        </div>

        <Tabs defaultValue="imap" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="imap" className="gap-2">
              <Mail className="w-4 h-4" />
              Email de Captura
            </TabsTrigger>
            <TabsTrigger value="smtp" className="gap-2">
              <Send className="w-4 h-4" />
              SMTP (Notificações)
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-2">
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="w-4 h-4" />
              Notificações
            </TabsTrigger>
          </TabsList>

          <Suspense fallback={<PageLoader />}>
            <TabsContent value="imap"><ImapAccountsTab /></TabsContent>
            <TabsContent value="smtp"><SmtpSettingsTab /></TabsContent>
            <TabsContent value="whatsapp"><WhatsappSettingsTab /></TabsContent>
            <TabsContent value="notifications">
              {settingsLoading ? <PageLoader /> : <NotificationsTab settings={settings} saveMutation={saveMutation} user={user} />}
            </TabsContent>
          </Suspense>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default SystemSettings;

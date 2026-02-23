import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Plus, Trash2, CheckCircle2, BookOpen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface TicketChecklistProps {
  ticketId: string;
}

interface ChecklistItem {
  id: string;
  title: string;
  is_completed: boolean;
  completed_at: string | null;
  item_order: number;
  kb_article_id: string | null;
}

interface TicketChecklist {
  id: string;
  template_name: string;
  created_at: string;
  items: ChecklistItem[];
}

const TicketChecklistComponent = ({ ticketId }: TicketChecklistProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [checklists, setChecklists] = useState<TicketChecklist[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const fetchChecklists = async () => {
    const { data: tcs } = await supabase
      .from("ticket_checklists" as any)
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (tcs) {
      const result: TicketChecklist[] = [];
      for (const tc of tcs as any[]) {
        const { data: items } = await supabase
          .from("ticket_checklist_items" as any)
          .select("*")
          .eq("ticket_checklist_id", tc.id)
          .order("item_order", { ascending: true });
        result.push({ ...tc, items: (items as any[]) || [] });
      }
      setChecklists(result);
    }
    setLoading(false);
  };

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from("checklist_templates" as any)
      .select("id, name")
      .order("name");
    if (data) setTemplates(data as any[]);
  };

  useEffect(() => {
    fetchChecklists();
    fetchTemplates();
  }, [ticketId]);

  const applyTemplate = async () => {
    if (!selectedTemplate) return;
    setAdding(true);

    try {
      const tpl = templates.find((t) => t.id === selectedTemplate);
      const { data: tplItems } = await supabase
        .from("checklist_template_items" as any)
        .select("*")
        .eq("template_id", selectedTemplate)
        .order("item_order", { ascending: true });

      const { data: tc, error } = await supabase
        .from("ticket_checklists" as any)
        .insert({ ticket_id: ticketId, template_id: selectedTemplate, template_name: tpl?.name || "" } as any)
        .select()
        .single();

      if (error) throw error;

      if (tplItems && (tplItems as any[]).length > 0) {
        const itemsToInsert = (tplItems as any[]).map((item: any) => ({
          ticket_checklist_id: (tc as any).id,
          title: item.title,
          item_order: item.item_order,
          kb_article_id: item.kb_article_id || null,
        }));
        await supabase.from("ticket_checklist_items" as any).insert(itemsToInsert as any);
      }

      setSelectedTemplate("");
      toast({ title: "Checklist aplicado ao chamado!" });
      fetchChecklists();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const toggleItem = async (checklistId: string, item: ChecklistItem) => {
    const newCompleted = !item.is_completed;
    await supabase
      .from("ticket_checklist_items" as any)
      .update({
        is_completed: newCompleted,
        completed_at: newCompleted ? new Date().toISOString() : null,
        completed_by: newCompleted ? user?.id : null,
      } as any)
      .eq("id", item.id);

    setChecklists((prev) =>
      prev.map((cl) =>
        cl.id === checklistId
          ? {
              ...cl,
              items: cl.items.map((i) =>
                i.id === item.id
                  ? { ...i, is_completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null }
                  : i
              ),
            }
          : cl
      )
    );
  };

  const removeChecklist = async (id: string) => {
    await supabase.from("ticket_checklists" as any).delete().eq("id", id);
    toast({ title: "Checklist removido do chamado" });
    fetchChecklists();
  };

  const getProgress = (items: ChecklistItem[]) => {
    if (items.length === 0) return 0;
    return Math.round((items.filter((i) => i.is_completed).length / items.length) * 100);
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Checklists
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Apply template */}
        <div className="flex gap-2">
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Selecione um checklist..." />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={applyTemplate} disabled={!selectedTemplate || adding}>
            <Plus className="w-4 h-4 mr-1" />
            Aplicar
          </Button>
        </div>

        {/* Applied checklists */}
        {checklists.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum checklist aplicado a este chamado.</p>
        )}

        {checklists.map((cl) => {
          const progress = getProgress(cl.items);
          return (
            <div key={cl.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{cl.template_name}</span>
                  <Badge variant={progress === 100 ? "default" : "secondary"} className="text-xs">
                    {progress === 100 ? (
                      <><CheckCircle2 className="w-3 h-3 mr-1" />Concluído</>
                    ) : (
                      `${progress}%`
                    )}
                  </Badge>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover checklist?</AlertDialogTitle>
                      <AlertDialogDescription>O checklist e todo seu progresso serão removidos deste chamado.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => removeChecklist(cl.id)}>Remover</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {/* Items */}
              <div className="space-y-1">
                {cl.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50"
                  >
                    <label className="flex items-center gap-2 flex-1 cursor-pointer">
                      <Checkbox
                        checked={item.is_completed}
                        onCheckedChange={() => toggleItem(cl.id, item)}
                      />
                      <span className={`text-sm ${item.is_completed ? "line-through text-muted-foreground" : ""}`}>
                        {item.title}
                      </span>
                    </label>
                    {item.kb_article_id && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={`/admin/knowledge-base?article=${item.kb_article_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:text-primary/80 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <BookOpen className="w-4 h-4" />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>Abrir Base de Conhecimento</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default TicketChecklistComponent;

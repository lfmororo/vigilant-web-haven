import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, GripVertical, Pencil, ClipboardList } from "lucide-react";

interface TemplateItem {
  id: string;
  title: string;
  item_order: number;
  kb_article_id: string | null;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  items: TemplateItem[];
}

const ChecklistManagement = () => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<{ id?: string; title: string; kb_article_id?: string | null }[]>([]);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemKbArticle, setNewItemKbArticle] = useState("");
  const [kbArticles, setKbArticles] = useState<{ id: string; title: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const fetchKbArticles = async () => {
    const { data } = await supabase
      .from("kb_articles" as any)
      .select("id, title")
      .order("title");
    if (data) setKbArticles(data as any[]);
  };

  const fetchTemplates = async () => {
    setLoading(true);
    const { data: tpls } = await supabase
      .from("checklist_templates" as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (tpls) {
      const templatesWithItems: Template[] = [];
      for (const t of tpls as any[]) {
        const { data: itemsData } = await supabase
          .from("checklist_template_items" as any)
          .select("*")
          .eq("template_id", t.id)
          .order("item_order", { ascending: true });
        templatesWithItems.push({ ...t, items: (itemsData as any[]) || [] });
      }
      setTemplates(templatesWithItems);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); fetchKbArticles(); }, []);

  const openCreate = () => {
    setEditingTemplate(null);
    setName("");
    setDescription("");
    setItems([]);
    setNewItemTitle("");
    setNewItemKbArticle("");
    setDialogOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditingTemplate(t);
    setName(t.name);
    setDescription(t.description || "");
    setItems(t.items.map((i) => ({ id: i.id, title: i.title, kb_article_id: i.kb_article_id })));
    setNewItemTitle("");
    setNewItemKbArticle("");
    setDialogOpen(true);
  };

  const addItem = () => {
    if (!newItemTitle.trim()) return;
    setItems([...items, { title: newItemTitle.trim(), kb_article_id: (newItemKbArticle && newItemKbArticle !== "none") ? newItemKbArticle : null }]);
    setNewItemTitle("");
    setNewItemKbArticle("");
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const moveItem = (idx: number, direction: "up" | "down") => {
    const newItems = [...items];
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newItems.length) return;
    [newItems[idx], newItems[targetIdx]] = [newItems[targetIdx], newItems[idx]];
    setItems(newItems);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Adicione pelo menos um item", variant: "destructive" });
      return;
    }
    setSaving(true);

    try {
      if (editingTemplate) {
        // Update template
        await supabase
          .from("checklist_templates" as any)
          .update({ name: name.trim(), description: description.trim() || null, updated_at: new Date().toISOString() } as any)
          .eq("id", editingTemplate.id);

        // Delete old items and re-insert
        await supabase
          .from("checklist_template_items" as any)
          .delete()
          .eq("template_id", editingTemplate.id);

        const itemsToInsert = items.map((item, idx) => ({
          template_id: editingTemplate.id,
          title: item.title,
          item_order: idx,
          kb_article_id: item.kb_article_id || null,
        }));
        await supabase.from("checklist_template_items" as any).insert(itemsToInsert as any);

        toast({ title: "Checklist atualizado com sucesso!" });
      } else {
        // Create template
        const { data: newTpl, error } = await supabase
          .from("checklist_templates" as any)
          .insert({ name: name.trim(), description: description.trim() || null } as any)
          .select()
          .single();

        if (error) throw error;

        const itemsToInsert = items.map((item, idx) => ({
          template_id: (newTpl as any).id,
          title: item.title,
          item_order: idx,
          kb_article_id: item.kb_article_id || null,
        }));
        await supabase.from("checklist_template_items" as any).insert(itemsToInsert as any);

        toast({ title: "Checklist criado com sucesso!" });
      }

      setDialogOpen(false);
      fetchTemplates();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from("checklist_templates" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Checklist excluído!" });
      fetchTemplates();
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Checklists</h1>
            <p className="text-muted-foreground">Gerencie templates de checklist para chamados</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Novo Checklist
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingTemplate ? "Editar Checklist" : "Novo Checklist"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Formatação de PC - Setor Pessoal" />
                </div>
                <div>
                  <Label>Descrição (opcional)</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição do checklist" />
                </div>

                <div>
                  <Label>Itens do Checklist</Label>
                  <div className="space-y-1 mt-2">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        draggable
                        onDragStart={() => setDragIdx(idx)}
                        onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                        onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragIdx === null || dragIdx === idx) return;
                          const newItems = [...items];
                          const [moved] = newItems.splice(dragIdx, 1);
                          newItems.splice(idx, 0, moved);
                          setItems(newItems);
                          setDragIdx(null);
                          setDragOverIdx(null);
                        }}
                        className={`flex items-center gap-2 rounded-md p-2 cursor-grab active:cursor-grabbing transition-colors ${
                          dragOverIdx === idx && dragIdx !== idx ? "bg-primary/10 border border-primary/30" : "bg-muted/50"
                        } ${dragIdx === idx ? "opacity-50" : ""}`}
                      >
                        <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1">
                          <span className="text-sm">{item.title}</span>
                          {item.kb_article_id && (
                            <span className="text-xs text-primary ml-2">📖 KB vinculado</span>
                          )}
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 mt-2">
                    <div className="flex gap-2">
                      <Input
                        value={newItemTitle}
                        onChange={(e) => setNewItemTitle(e.target.value)}
                        placeholder="Ex: Instalar Office 365"
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())}
                      />
                      <Button type="button" variant="outline" onClick={addItem}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <Select value={newItemKbArticle} onValueChange={setNewItemKbArticle}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Vincular artigo da Base de Conhecimento (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {kbArticles.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? "Salvando..." : editingTemplate ? "Salvar Alterações" : "Criar Checklist"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum checklist cadastrado.</p>
              <p className="text-sm">Crie seu primeiro checklist para usar nos chamados.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Card key={t.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir checklist?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. Checklists já aplicados em chamados não serão afetados.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteTemplate(t.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-2">{t.items.length} {t.items.length === 1 ? "item" : "itens"}</p>
                  <ul className="space-y-1">
                    {t.items.slice(0, 5).map((item) => (
                      <li key={item.id} className="text-sm flex items-center gap-2">
                        <div className="w-3.5 h-3.5 rounded border border-border shrink-0" />
                        {item.title}
                      </li>
                    ))}
                    {t.items.length > 5 && (
                      <li className="text-xs text-muted-foreground">+{t.items.length - 5} mais...</li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default ChecklistManagement;

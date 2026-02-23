import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Pencil, BookOpen, FolderOpen, ArrowLeft, Search } from "lucide-react";

interface Category {
  id: string;
  name: string;
  description: string | null;
}

interface Article {
  id: string;
  title: string;
  content: string;
  category_id: string | null;
  created_at: string;
  updated_at: string;
  category?: Category | null;
}

const KnowledgeBase = () => {
  const { toast } = useToast();
  const { user } = useAuth();

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [showCatForm, setShowCatForm] = useState(false);

  // Articles
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [artDialogOpen, setArtDialogOpen] = useState(false);
  const [editingArt, setEditingArt] = useState<Article | null>(null);
  const [artTitle, setArtTitle] = useState("");
  const [artContent, setArtContent] = useState("");
  const [artCategoryId, setArtCategoryId] = useState("");
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  // View
  const [viewingArticle, setViewingArticle] = useState<Article | null>(null);

  const fetchCategories = async () => {
    const { data } = await supabase.from("kb_categories" as any).select("*").order("name");
    if (data) setCategories(data as any[]);
  };

  const fetchArticles = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("kb_articles" as any)
      .select("*, category:kb_categories(*)")
      .order("updated_at", { ascending: false });
    if (data) setArticles(data as any[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchCategories();
    fetchArticles();
  }, []);

  // Category CRUD
  const openCreateCat = () => { setEditingCat(null); setCatName(""); setCatDesc(""); setShowCatForm(true); setCatDialogOpen(true); };
  const openEditCat = (c: Category) => { setEditingCat(c); setCatName(c.name); setCatDesc(c.description || ""); setShowCatForm(true); setCatDialogOpen(true); };

  const saveCat = async () => {
    if (!catName.trim()) return;
    if (editingCat) {
      await supabase.from("kb_categories" as any).update({ name: catName.trim(), description: catDesc.trim() || null } as any).eq("id", editingCat.id);
      toast({ title: "Categoria atualizada!" });
    } else {
      await supabase.from("kb_categories" as any).insert({ name: catName.trim(), description: catDesc.trim() || null } as any);
      toast({ title: "Categoria criada!" });
    }
    setCatDialogOpen(false);
    setShowCatForm(false);
    fetchCategories();
  };

  const deleteCat = async (id: string) => {
    await supabase.from("kb_categories" as any).delete().eq("id", id);
    toast({ title: "Categoria excluída!" });
    fetchCategories();
    fetchArticles();
  };

  // Article CRUD
  const openCreateArt = () => {
    setEditingArt(null); setArtTitle(""); setArtContent(""); setArtCategoryId(""); setArtDialogOpen(true);
  };
  const openEditArt = (a: Article) => {
    setEditingArt(a); setArtTitle(a.title); setArtContent(a.content); setArtCategoryId(a.category_id || ""); setArtDialogOpen(true);
  };

  const saveArt = async () => {
    if (!artTitle.trim() || !artContent.trim()) {
      toast({ title: "Título e conteúdo são obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        title: artTitle.trim(),
        content: artContent.trim(),
        category_id: artCategoryId || null,
        updated_at: new Date().toISOString(),
      };
      if (editingArt) {
        await supabase.from("kb_articles" as any).update(payload).eq("id", editingArt.id);
        toast({ title: "Artigo atualizado!" });
      } else {
        payload.created_by = user?.id || null;
        await supabase.from("kb_articles" as any).insert(payload);
        toast({ title: "Artigo criado!" });
      }
      setArtDialogOpen(false);
      fetchArticles();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const deleteArt = async (id: string) => {
    await supabase.from("kb_articles" as any).delete().eq("id", id);
    toast({ title: "Artigo excluído!" });
    fetchArticles();
    if (viewingArticle?.id === id) setViewingArticle(null);
  };

  const filtered = articles.filter((a) => {
    const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.content.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === "all" || a.category_id === filterCategory;
    return matchSearch && matchCat;
  });

  // Viewing an article
  if (viewingArticle) {
    return (
      <AdminLayout>
        <div className="space-y-4 max-w-3xl">
          <Button variant="ghost" onClick={() => setViewingArticle(null)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
          </Button>
          <div>
            {viewingArticle.category && (
              <Badge variant="secondary" className="mb-2">{(viewingArticle.category as any).name}</Badge>
            )}
            <h1 className="text-2xl font-bold">{viewingArticle.title}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Atualizado em {new Date(viewingArticle.updated_at).toLocaleDateString("pt-BR")}
            </p>
          </div>
          <Card>
            <CardContent className="pt-6 prose prose-sm max-w-none whitespace-pre-wrap">
              {viewingArticle.content}
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Base de Conhecimento</h1>
            <p className="text-muted-foreground">Artigos e tutoriais passo a passo</p>
          </div>
          <div className="flex gap-2">
            {/* Category management dialog */}
            <Dialog open={catDialogOpen} onOpenChange={(open) => { setCatDialogOpen(open); if (!open) setShowCatForm(false); }}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={() => { setShowCatForm(false); setCatDialogOpen(true); }}>
                  <FolderOpen className="w-4 h-4 mr-2" /> Categorias
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingCat ? "Editar Categoria" : "Gerenciar Categorias"}</DialogTitle>
                </DialogHeader>
                {showCatForm ? (
                  <div className="space-y-3">
                    <div><Label>Nome</Label><Input value={catName} onChange={(e) => setCatName(e.target.value)} /></div>
                    <div><Label>Descrição</Label><Input value={catDesc} onChange={(e) => setCatDesc(e.target.value)} /></div>
                    <div className="flex gap-2">
                      <Button onClick={saveCat} className="flex-1">{editingCat ? "Salvar" : "Criar"}</Button>
                      <Button variant="outline" onClick={() => { setShowCatForm(false); setEditingCat(null); setCatName(""); setCatDesc(""); }}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Button variant="outline" className="w-full" onClick={openCreateCat}>
                      <Plus className="w-4 h-4 mr-2" /> Nova Categoria
                    </Button>
                    {categories.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhuma categoria.</p>
                    ) : (
                      categories.map((c) => (
                        <div key={c.id} className="flex items-center justify-between bg-muted/50 rounded-md p-2">
                          <div>
                            <p className="text-sm font-medium">{c.name}</p>
                            {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCat(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
                                  <AlertDialogDescription>Artigos desta categoria não serão excluídos, apenas ficarão sem categoria.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteCat(c.id)}>Excluir</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </DialogContent>
            </Dialog>

            <Button onClick={openCreateArt}>
              <Plus className="w-4 h-4 mr-2" /> Novo Artigo
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar artigos..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Article dialog */}
        <Dialog open={artDialogOpen} onOpenChange={setArtDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingArt ? "Editar Artigo" : "Novo Artigo"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Título</Label>
                <Input value={artTitle} onChange={(e) => setArtTitle(e.target.value)} placeholder="Ex: Como instalar impressora HP LaserJet" />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={artCategoryId} onValueChange={setArtCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Conteúdo (passo a passo)</Label>
                <Textarea
                  value={artContent}
                  onChange={(e) => setArtContent(e.target.value)}
                  placeholder={"1. Baixe o driver no site do fabricante\n2. Execute o instalador\n3. Conecte a impressora via USB\n4. Siga o assistente de instalação\n5. Imprima uma página de teste"}
                  rows={15}
                />
              </div>
              <Button onClick={saveArt} disabled={saving} className="w-full">
                {saving ? "Salvando..." : editingArt ? "Salvar Alterações" : "Criar Artigo"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Articles list */}
        {loading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum artigo encontrado.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((a) => (
              <Card
                key={a.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setViewingArticle(a)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {a.category && (
                        <Badge variant="secondary" className="text-xs mb-1">{(a.category as any).name}</Badge>
                      )}
                      <CardTitle className="text-base line-clamp-2">{a.title}</CardTitle>
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditArt(a)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir artigo?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteArt(a.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">{a.content}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(a.updated_at).toLocaleDateString("pt-BR")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default KnowledgeBase;

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, ImageIcon, FileText, Download, Paperclip } from "lucide-react";

interface TicketAttachmentsProps {
  ticketId: string;
}

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i;

interface FileItem {
  name: string;
  url: string;
  created_at: string;
  isImage: boolean;
  size?: number;
}

const formatSize = (bytes?: number) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const TicketAttachments = ({ ticketId }: TicketAttachmentsProps) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    const fetchAttachments = async () => {
      setLoading(true);
      const { data: storageFiles, error } = await supabase.storage
        .from("ticket-attachments")
        .list(ticketId, { sortBy: { column: "created_at", order: "desc" }, limit: 100 });

      if (error || !storageFiles) {
        setFiles([]);
        setLoading(false);
        return;
      }

      const items: FileItem[] = storageFiles
        .filter((f) => f.name && !f.name.startsWith("."))
        .map((f) => {
          const { data } = supabase.storage
            .from("ticket-attachments")
            .getPublicUrl(`${ticketId}/${f.name}`);
          return {
            name: f.name,
            url: data.publicUrl,
            created_at: f.created_at || "",
            isImage: IMAGE_EXTENSIONS.test(f.name),
            size: (f.metadata as any)?.size,
          };
        });

      setFiles(items);
      setLoading(false);
    };

    fetchAttachments();
  }, [ticketId]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">Anexos</CardTitle></CardHeader>
        <CardContent className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (files.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Paperclip className="w-4 h-4" />Anexos</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground text-center py-2">Nenhum anexo neste chamado</p>
        </CardContent>
      </Card>
    );
  }

  const images = files.filter((f) => f.isImage);
  const others = files.filter((f) => !f.isImage);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Paperclip className="w-4 h-4" />Anexos ({files.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {images.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                <ImageIcon className="w-3 h-3" /> Imagens ({images.length})
              </div>
              <div className="grid grid-cols-3 gap-2">
                {images.map((img) => (
                  <button
                    key={img.name}
                    onClick={() => setSelectedImage(img.url)}
                    className="relative aspect-square rounded-md overflow-hidden border border-border hover:border-primary transition-colors group cursor-pointer"
                    title={img.name}
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {others.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                <FileText className="w-3 h-3" /> Arquivos ({others.length})
              </div>
              <div className="space-y-1">
                {others.map((f) => (
                  <a
                    key={f.name}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 rounded-md border border-border hover:border-primary hover:bg-muted/50 transition-colors text-xs group"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{f.name}</p>
                      {f.size && <p className="text-muted-foreground">{formatSize(f.size)}</p>}
                    </div>
                    <Download className="w-3 h-3 text-muted-foreground group-hover:text-primary shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-3xl p-2">
          {selectedImage && (
            <img
              src={selectedImage}
              alt="Anexo"
              className="w-full h-auto max-h-[80vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TicketAttachments;

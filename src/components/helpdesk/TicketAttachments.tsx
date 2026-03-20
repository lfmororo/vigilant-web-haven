import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, ImageIcon } from "lucide-react";

interface TicketAttachmentsProps {
  ticketId: string;
}

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;

const TicketAttachments = ({ ticketId }: TicketAttachmentsProps) => {
  const [images, setImages] = useState<{ name: string; url: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    const fetchAttachments = async () => {
      setLoading(true);
      const { data: files, error } = await supabase.storage
        .from("ticket-attachments")
        .list(ticketId, { sortBy: { column: "created_at", order: "desc" } });

      if (error || !files) {
        setImages([]);
        setLoading(false);
        return;
      }

      const imageFiles = files
        .filter((f) => IMAGE_EXTENSIONS.test(f.name))
        .map((f) => {
          const { data } = supabase.storage
            .from("ticket-attachments")
            .getPublicUrl(`${ticketId}/${f.name}`);
          return {
            name: f.name,
            url: data.publicUrl,
            created_at: f.created_at || "",
          };
        });

      setImages(imageFiles);
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

  if (images.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ImageIcon className="w-4 h-4" />Anexos ({images.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {images.map((img) => (
              <button
                key={img.name}
                onClick={() => setSelectedImage(img.url)}
                className="relative aspect-square rounded-md overflow-hidden border border-border hover:border-primary transition-colors group cursor-pointer"
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

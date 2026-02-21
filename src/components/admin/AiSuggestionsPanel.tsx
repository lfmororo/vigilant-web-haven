import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Copy, Check, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AiSuggestionsPanelProps {
  ticketId: string;
  ticketTitle: string;
  ticketDescription: string;
  ticketCategory?: string;
  ticketPriority: string;
  messages: Array<{ sender_name: string; message: string }>;
}

const AiSuggestionsPanel = ({
  ticketTitle,
  ticketDescription,
  ticketCategory,
  ticketPriority,
  messages,
}: AiSuggestionsPanelProps) => {
  const [suggestions, setSuggestions] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const { toast } = useToast();

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setSuggestions("");

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-suggest-reply`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          ticket_title: ticketTitle,
          ticket_description: ticketDescription,
          ticket_category: ticketCategory,
          ticket_priority: ticketPriority,
          messages: messages.slice(-10),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro desconhecido" }));
        toast({ variant: "destructive", title: "Erro IA", description: err.error || `Erro ${resp.status}` });
        setLoading(false);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) { setLoading(false); return; }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              setSuggestions(fullText);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (err) {
      console.error("AI suggestion error:", err);
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível gerar sugestões." });
    }

    setLoading(false);
  }, [ticketTitle, ticketDescription, ticketCategory, ticketPriority, messages, toast]);

  const copySuggestion = (text: string, idx: number) => {
    navigator.clipboard.writeText(text.trim());
    setCopiedIdx(idx);
    toast({ title: "Copiado!", description: "Sugestão copiada para a área de transferência." });
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  // Split suggestions into blocks (by numbered patterns like "1.", "2.", "3." or **Sugestão**)
  const parseSuggestions = (text: string): string[] => {
    if (!text) return [];
    // Try splitting by numbered patterns
    const parts = text.split(/(?=(?:^|\n)(?:\d+[\.\)]\s|\*\*(?:Sugestão|Resposta|Opção)\s*\d+))/i).filter(s => s.trim());
    if (parts.length >= 2) return parts;
    // Fallback: split by double newlines
    const blocks = text.split(/\n{2,}/).filter(s => s.trim());
    return blocks.length >= 2 ? blocks : [text];
  };

  const suggestionBlocks = parseSuggestions(suggestions);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Sugestões de IA
          </CardTitle>
          {suggestions && (
            <Button variant="ghost" size="sm" onClick={fetchSuggestions} disabled={loading} className="h-7 px-2">
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!suggestions && !loading && (
          <Button onClick={fetchSuggestions} variant="outline" className="w-full gap-2" size="sm">
            <Sparkles className="h-4 w-4" />
            Gerar Sugestões
          </Button>
        )}

        {loading && !suggestions && (
          <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Gerando sugestões...</span>
          </div>
        )}

        {suggestions && (
          <div className="space-y-3">
            {suggestionBlocks.map((block, i) => (
              <div
                key={i}
                className="group relative rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed hover:bg-muted/50 transition-colors"
              >
                <p className="whitespace-pre-wrap pr-8">{block.trim()}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => copySuggestion(block, i)}
                >
                  {copiedIdx === i ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AiSuggestionsPanel;

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle, Lightbulb, TrendingUp } from "lucide-react";

interface RecurrencePanelProps {
  ticketId: string;
}

interface RecurrenceResult {
  is_recurring: boolean;
  confidence?: string;
  similar_count?: number;
  pattern_description?: string;
  frequency?: string;
  root_cause_hypothesis?: string;
  suggestions?: string[];
  message?: string;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  alta: "bg-destructive/10 text-destructive border-destructive/30",
  média: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  baixa: "bg-muted text-muted-foreground border-border",
};

const RecurrencePanel = ({ ticketId }: RecurrencePanelProps) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecurrenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("ai-predict-recurrence", {
        body: { ticket_id: ticketId },
      });
      if (fnError) throw fnError;
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Erro ao analisar recorrência");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Previsão de Recorrência
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!result && !loading && !error && (
          <Button onClick={analyze} variant="outline" size="sm" className="w-full">
            <RefreshCw className="w-3.5 h-3.5 mr-2" />
            Analisar Recorrência com IA
          </Button>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Analisando histórico do cliente...
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive">{error}</div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {result.is_recurring ? (
                <AlertTriangle className="w-4 h-4 text-orange-500" />
              ) : (
                <CheckCircle className="w-4 h-4 text-green-500" />
              )}
              <span className="text-sm font-medium">
                {result.is_recurring ? "Ticket recorrente detectado" : "Não parece recorrente"}
              </span>
              {result.confidence && (
                <Badge variant="outline" className={`text-xs ${CONFIDENCE_COLORS[result.confidence] || ""}`}>
                  {result.confidence}
                </Badge>
              )}
            </div>

            {result.similar_count !== undefined && result.similar_count > 0 && (
              <p className="text-xs text-muted-foreground">
                {result.similar_count} ticket(s) semelhante(s) encontrado(s)
                {result.frequency && ` • Frequência: ${result.frequency}`}
              </p>
            )}

            {result.pattern_description && (
              <div className="bg-muted/50 rounded-md p-2.5">
                <p className="text-xs font-medium mb-1">Padrão identificado:</p>
                <p className="text-xs text-muted-foreground">{result.pattern_description}</p>
              </div>
            )}

            {result.root_cause_hypothesis && (
              <div className="bg-muted/50 rounded-md p-2.5">
                <p className="text-xs font-medium mb-1">Possível causa raiz:</p>
                <p className="text-xs text-muted-foreground">{result.root_cause_hypothesis}</p>
              </div>
            )}

            {result.suggestions && result.suggestions.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1.5 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3" /> Sugestões preventivas:
                </p>
                <ul className="space-y-1">
                  {result.suggestions.map((s, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="text-primary font-medium">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.message && !result.is_recurring && (
              <p className="text-xs text-muted-foreground">{result.message}</p>
            )}

            <Button onClick={analyze} variant="ghost" size="sm" className="w-full text-xs">
              <RefreshCw className="w-3 h-3 mr-1" /> Reanalisar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecurrencePanel;

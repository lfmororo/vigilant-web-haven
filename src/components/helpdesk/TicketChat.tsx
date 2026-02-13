import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Send, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
  sender_id: string;
  sender?: { full_name: string };
}

interface TicketChatProps {
  ticketId: string;
  isAdmin?: boolean;
  isStaff?: boolean;
}

const TicketChat = ({ ticketId, isAdmin = false, isStaff = false }: TicketChatProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const canSendInternal = isAdmin || isStaff;

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("ticket_messages")
      .select("*, sender:profiles!ticket_messages_sender_id_fkey(full_name)")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as any);
  };

  useEffect(() => {
    fetchMessages();
    const channel = supabase
      .channel(`ticket-${ticketId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticketId}` }, () => {
        fetchMessages();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ticketId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user) return;
    setSending(true);
    const { error } = await supabase.from("ticket_messages").insert({
      ticket_id: ticketId,
      sender_id: user.id,
      message: newMessage.trim(),
      is_internal: canSendInternal ? isInternal : false,
    });
    if (error) {
      toast({ variant: "destructive", title: "Erro ao enviar mensagem", description: error.message });
    } else {
      setNewMessage("");
      setIsInternal(false);
    }
    setSending(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 p-4 max-h-[400px]">
        {messages.map((msg) => {
          const isOwn = msg.sender_id === user?.id;
          return (
            <div key={msg.id} className={cn("flex flex-col max-w-[80%]", isOwn ? "ml-auto items-end" : "items-start")}>
              {msg.is_internal && (
                <span className="text-xs text-yellow-400 flex items-center gap-1 mb-1">
                  <Lock className="w-3 h-3" /> Nota interna
                </span>
              )}
              <div className={cn(
                "rounded-lg px-4 py-2 text-sm",
                msg.is_internal ? "bg-yellow-500/10 border border-yellow-500/20" :
                isOwn ? "bg-primary text-primary-foreground" : "bg-muted"
              )}>
                {msg.message}
              </div>
              <span className="text-xs text-muted-foreground mt-1">
                {msg.sender?.full_name} · {new Date(msg.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border p-4 space-y-2">
        {canSendInternal && (
          <div className="flex items-center gap-2">
            <Checkbox id="internal" checked={isInternal} onCheckedChange={(v) => setIsInternal(!!v)} />
            <label htmlFor="internal" className="text-xs text-muted-foreground cursor-pointer">Nota interna (somente equipe)</label>
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            placeholder="Digite sua mensagem..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="min-h-[60px] resize-none"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="icon" className="shrink-0 self-end">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TicketChat;

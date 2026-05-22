import { useState, useRef, useEffect } from "react";
import { X, Send, MessageCircle, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  from: "ops" | "farm";
  senderName: string;
  text: string;
  sentAt: string;
}

interface Props {
  farmName: string;
  messages: ChatMessage[];
  onClose: () => void;
}

export default function FarmChatModal({ farmName, messages: initialMessages, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      from: "ops",
      senderName: "You (Ops)",
      text,
      sentAt: "just now",
    }]);
    setDraft("");
    textareaRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: "min(85vh, 580px)" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-primary rounded-t-2xl">
          <div className="w-9 h-9 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0">
            <MessageCircle className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-primary-foreground font-bold text-sm truncate">{farmName}</p>
            <p className="text-primary-foreground/60 text-[10px] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              Farm Manager · Online
            </p>
          </div>
          <button
            className="w-8 h-8 rounded-full bg-primary-foreground/10 hover:bg-primary-foreground/20 flex items-center justify-center transition-colors"
          >
            <Phone className="w-3.5 h-3.5 text-primary-foreground" />
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-primary-foreground/10 hover:bg-primary-foreground/20 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-secondary/20">
          {messages.map(msg => (
            <div key={msg.id} className={cn("flex flex-col gap-0.5", msg.from === "ops" ? "items-end" : "items-start")}>
              <span className="text-[10px] text-muted-foreground px-1">{msg.senderName} · {msg.sentAt}</span>
              <div className={cn(
                "max-w-[82%] px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
                msg.from === "ops"
                  ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
                  : "bg-card text-foreground border border-border/60 rounded-2xl rounded-bl-md"
              )}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-3 py-3 border-t border-border bg-card rounded-b-2xl flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={`Message ${farmName}…`}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[40px] max-h-[100px]"
          />
          <button
            onClick={send}
            disabled={!draft.trim()}
            className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            <Send className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}

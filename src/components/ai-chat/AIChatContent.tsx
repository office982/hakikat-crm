"use client";

import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Send, Bot, User, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  action?: string;
  confirmationNeeded?: boolean;
  confirmationMessage?: string;
  timestamp: Date;
}

export function AIChatContent() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "שלום! אני הסוכן החכם של קבוצת חקיקת. אפשר לדבר איתי בעברית פשוטה.\n\nלדוגמה:\n• \"יוסי מלכה שילם 1500 עבור אפריל\"\n• \"מה היתרה של אברהם כהן?\"\n• \"תכין חוזה למשה מ-1.5.26 סכום 2000\"\n• \"תוסיף חשבונית 15000 לפרויקט שיפוץ\"",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.text }),
      });

      const data = await response.json();

      if (response.ok) {
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          text: data.response_message || data.confirmation_message || "קיבלתי!",
          action: data.action,
          confirmationNeeded: data.confirmation_needed,
          confirmationMessage: data.confirmation_message,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            text: data.error || "שגיאה בעיבוד הבקשה. ודא שה-API key של Claude מוגדר בהגדרות.",
            timestamp: new Date(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          text: "שגיאת חיבור. ודא שה-API key של Anthropic מוגדר ב-.env.local",
          timestamp: new Date(),
        },
      ]);
    }

    setIsLoading(false);
  };

  const handleConfirm = async (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, confirmationNeeded: false, text: m.text + "\n\n✅ אושר!" } : m
      )
    );
    // TODO: Execute the confirmed action via API
  };

  const actionLabels: Record<string, string> = {
    record_payment: "רישום תשלום",
    create_contract: "יצירת חוזה",
    add_project_expense: "הוצאת פרויקט",
    query_balance: "שאילתת יתרה",
    send_reminder: "שליחת תזכורת",
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-140px)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-3",
              msg.role === "user" ? "flex-row-reverse" : ""
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
              msg.role === "user" ? "bg-primary text-white" : "bg-accent text-primary"
            )}>
              {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={cn(
              "max-w-[80%] rounded-xl px-4 py-3",
              msg.role === "user" ? "bg-primary text-white" : "bg-surface border border-border"
            )}>
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              {msg.action && msg.action !== "unknown" && (
                <Badge variant="info" className="mt-2">{actionLabels[msg.action] || msg.action}</Badge>
              )}
              {msg.confirmationNeeded && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => handleConfirm(msg.id)}>
                    <CheckCircle className="w-3 h-3" />
                    אשר
                  </Button>
                  <Button variant="secondary" size="sm">ביטול</Button>
                </div>
              )}
              <p className={cn(
                "text-[10px] mt-1",
                msg.role === "user" ? "text-blue-200" : "text-muted"
              )}>
                {msg.timestamp.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-accent text-primary flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-surface border border-border rounded-xl px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <Card className="shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="כתוב הודעה... לדוגמה: 'יוסי שילם 1500 עבור אפריל'"
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            disabled={isLoading}
          />
          <Button type="submit" disabled={!input.trim() || isLoading}>
            <Send className="w-4 h-4" />
            שלח
          </Button>
        </form>
      </Card>
    </div>
  );
}

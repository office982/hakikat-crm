"use client";

import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Send, Bot, User, Loader2, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  action?: string;
  pendingId?: string;
  pendingResolved?: "confirmed" | "rejected";
  timestamp: Date;
}

const SESSION_KEY = "ai-chat-session-id";

function getSessionId(): string {
  if (typeof window === "undefined") return "anon";
  let id = window.localStorage.getItem(SESSION_KEY);
  if (!id) {
    id =
      (window.crypto?.randomUUID?.() as string | undefined) ||
      `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
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
  const [busyPending, setBusyPending] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Build the rolling transcript that gets sent to Claude as history.
  function buildHistory(): { role: "user" | "assistant"; content: string }[] {
    return messages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, content: m.text }));
  }

  function appendAssistant(partial: Omit<Message, "id" | "role" | "timestamp">) {
    setMessages((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: "assistant",
        timestamp: new Date(),
        ...partial,
      },
    ]);
  }

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
      timestamp: new Date(),
    };

    const history = buildHistory();
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          session_id: getSessionId(),
          history,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        appendAssistant({
          text: data.error || "שגיאה בעיבוד הבקשה. ודא שה-API key של Claude מוגדר.",
        });
      } else if (data.kind === "confirmation") {
        appendAssistant({
          text: data.confirmation_message || "האם לאשר?",
          action: data.action,
          pendingId: data.pending_id,
        });
      } else {
        // Two-message reply: AI's acknowledgement first (if present), then the
        // executor's real result. Yields a natural "working on it… → here's
        // your answer" flow instead of one silent reply.
        if (data.response_message && data.response_message !== data.message) {
          appendAssistant({
            text: data.response_message,
            action: data.action,
          });
        }
        appendAssistant({
          text: data.message || "בוצע.",
          action: data.response_message ? undefined : data.action,
        });
      }
    } catch {
      appendAssistant({
        text: "שגיאת חיבור. ודא שהשרת רץ ושה-API keys מוגדרים.",
      });
    }

    setIsLoading(false);
  };

  const resolvePending = async (
    messageId: string,
    pendingId: string,
    decision: "confirm" | "reject"
  ) => {
    if (busyPending) return;
    setBusyPending(pendingId);

    try {
      const res = await fetch("/api/ai-agent/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pending_id: pendingId, decision }),
      });
      const data = await res.json();

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, pendingResolved: decision === "confirm" ? "confirmed" : "rejected" }
            : m
        )
      );

      appendAssistant({
        text: data.message || (decision === "confirm" ? "בוצע." : "בוטל."),
      });

      // Chain follow-up confirmation (e.g. "להוציא קבלה?" after record_payment).
      if (decision === "confirm" && data.follow_up?.pending_id) {
        appendAssistant({
          text: data.follow_up.confirmation_message,
          pendingId: data.follow_up.pending_id,
        });
      }
    } catch {
      appendAssistant({
        text: "שגיאת חיבור — נסה שוב.",
      });
    } finally {
      setBusyPending(null);
    }
  };

  const actionLabels: Record<string, string> = {
    record_payment: "רישום תשלום",
    create_contract: "יצירת חוזה",
    add_project_expense: "הוצאת פרויקט",
    query_balance: "שאילתת יתרה",
    query_report: "דוח חודשי",
    send_reminder: "שליחת תזכורת",
    mark_check_bounced: "צ'ק חוזר",
    renew_contract: "חידוש חוזה",
    query_reliability: "דירוג אמינות",
    compare_checks: "השוואת צ'קים",
    create_project: "פרויקט חדש",
    list_projects: "רשימת פרויקטים",
    delete_project: "מחיקת פרויקט",
    list_overdue: "רשימת חייבים",
    query_project_status: "מצב פרויקט",
    _issue_receipt: "הנפקת קבלה",
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
              {msg.pendingId && !msg.pendingResolved && (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    disabled={busyPending === msg.pendingId}
                    onClick={() => resolvePending(msg.id, msg.pendingId!, "confirm")}
                  >
                    {busyPending === msg.pendingId ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3 h-3" />
                    )}
                    אשר
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyPending === msg.pendingId}
                    onClick={() => resolvePending(msg.id, msg.pendingId!, "reject")}
                  >
                    <XCircle className="w-3 h-3" />
                    ביטול
                  </Button>
                </div>
              )}
              {msg.pendingResolved === "confirmed" && (
                <Badge variant="success" className="mt-2">אושר</Badge>
              )}
              {msg.pendingResolved === "rejected" && (
                <Badge variant="warning" className="mt-2">בוטל</Badge>
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

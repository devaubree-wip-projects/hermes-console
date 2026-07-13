"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function NewChatForm({
  workspaceId,
  autoFocus,
}: {
  workspaceId: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const content = value.trim();
    if (!content || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/chat-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, content }),
      });
      const data = (await res.json().catch(() => null)) as { sessionId?: string; error?: string } | null;
      if (!res.ok || !data?.sessionId) {
        setError(data?.error ?? "Impossible de démarrer la conversation. Réessayez.");
        setSubmitting(false);
        return;
      }
      router.push(`/w/${workspaceId}/chat/${data.sessionId}?autostart=1`);
    } catch {
      setError("Impossible de démarrer la conversation. Vérifiez votre connexion.");
      setSubmitting(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  return (
    <div className="space-y-2">
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          placeholder="Posez une question ou décrivez une tâche…"
          disabled={submitting}
          rows={1}
          className="max-h-52 flex-1 resize-none overflow-y-auto"
          aria-label="Nouveau message"
        />
        <Button type="submit" className="h-11 min-w-11 gap-1.5" disabled={submitting || !value.trim()}>
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
          <span className="hidden sm:inline">Envoyer</span>
        </Button>
      </form>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

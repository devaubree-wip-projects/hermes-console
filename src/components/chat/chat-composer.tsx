"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ChatComposer({
  onSend,
  onStop,
  streaming,
}: {
  onSend: (content: string) => void;
  onStop: () => void;
  streaming: boolean;
}) {
  const [value, setValue] = useState("");

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || streaming) return;
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Écrivez votre message… (Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne)"
        disabled={streaming}
        rows={1}
        className="max-h-52 flex-1 resize-none overflow-y-auto"
        aria-label="Message"
      />
      {streaming ? (
        <Button type="button" variant="outline" className="h-11 min-w-11 gap-1.5" onClick={onStop}>
          <Square className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Arrêter</span>
        </Button>
      ) : (
        <Button type="submit" className="h-11 min-w-11 gap-1.5" disabled={!value.trim()}>
          <Send className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Envoyer</span>
        </Button>
      )}
    </form>
  );
}

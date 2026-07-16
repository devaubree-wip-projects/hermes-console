"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, MessageSquarePlusIcon, NetworkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function WorkCommentComposer({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setPending(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
      const data = await response.json();
      if (!response.ok) return toast.error(data.error ?? "Commentaire impossible.");
      toast.success(data.runs?.length ? "Commentaire ajouté, l’agent mentionné a reçu un run." : "Commentaire ajouté.");
      setContent(""); router.refresh();
    } catch { toast.error("La Console est momentanément inaccessible."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-2"><Textarea aria-label="Ajouter un commentaire" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Ajouter un commentaire. Mentionnez @slug-agent pour créer un run ciblé." rows={3} maxLength={20_000} disabled={pending} /><div className="flex justify-end"><Button type="submit" size="sm" disabled={pending || !content.trim()}>{pending ? <Loader2Icon className="animate-spin" /> : <MessageSquarePlusIcon />}Publier</Button></div></form>;
}

export function PromotePlanStepButton({ endpoint, taskBase }: { endpoint: string; taskBase: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function promote() {
    setPending(true);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const data = await response.json();
      if (!response.ok) return toast.error(data.error ?? "Promotion impossible.");
      toast.success("Étape promue en sous-tâche métier.");
      router.push(`${taskBase}/${data.item.id}`);
    } catch { toast.error("La Console est momentanément inaccessible."); }
    finally { setPending(false); }
  }
  return <Button type="button" variant="ghost" size="icon-xs" aria-label="Promouvoir en sous-tâche" title="Promouvoir en sous-tâche" disabled={pending} onClick={promote}>{pending ? <Loader2Icon className="animate-spin" /> : <NetworkIcon />}</Button>;
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function NewAgentForm({
  endpoint,
  onSuccess,
}: {
  endpoint: string;
  onSuccess?: (redirectTo: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Création impossible.");
      if (onSuccess) {
        onSuccess(data.redirectTo);
      } else {
        router.push(data.redirectTo);
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Création impossible.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2"><Label htmlFor="agent-name">Nom de l’agent</Label><Input id="agent-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Assistant SEO" maxLength={80} required /></div>
      <div className="space-y-2"><Label htmlFor="agent-description">Mission</Label><Textarea id="agent-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Analyse le site, prépare les recommandations et produit les livrables SEO." rows={5} maxLength={500} /></div>
      <p className="text-sm text-muted-foreground">Un profil Hermes isolé sera créé pour cet agent. Il pourra ensuite posséder plusieurs sessions.</p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending || !name.trim()}>{pending ? <Loader2 className="animate-spin" /> : null}Créer l’agent</Button>
    </form>
  );
}

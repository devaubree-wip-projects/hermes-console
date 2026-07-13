"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [hermesBaseUrl, setHermesBaseUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Le nom du workspace est requis.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...(hermesBaseUrl.trim() ? { hermesBaseUrl: hermesBaseUrl.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Échec de la création du workspace.");
      }
      router.push(`/w/${data.workspaceId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la création du workspace.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="new-workspace-name">Nom du workspace</Label>
        <Input
          id="new-workspace-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. : Assistant Garage Dupont"
          maxLength={100}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-workspace-url">URL du gateway (optionnel)</Label>
        <Input
          id="new-workspace-url"
          type="url"
          value={hermesBaseUrl}
          onChange={(e) => setHermesBaseUrl(e.target.value)}
          placeholder="http://localhost:8645/v1"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Créer le workspace
      </Button>
    </form>
  );
}

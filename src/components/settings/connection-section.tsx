"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConnectionSection({
  workspaceId,
  hermesBaseUrl,
  hasApiKey,
}: {
  workspaceId: string;
  hermesBaseUrl: string;
  hasApiKey: boolean;
}) {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState(hermesBaseUrl);
  const [apiKey, setApiKey] = useState("");
  const [keyRegistered, setKeyRegistered] = useState(hasApiKey);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? "Échec de l'enregistrement.");
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = { hermesBaseUrl: baseUrl.trim() };
      if (apiKey.trim().length > 0) body.hermesApiKey = apiKey.trim();
      await patch(body);
      if (apiKey.trim().length > 0) {
        setKeyRegistered(true);
        setApiKey("");
      }
      toast.success("Enregistré");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'enregistrement.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveKey() {
    setIsRemoving(true);
    try {
      await patch({ hermesApiKey: null });
      setKeyRegistered(false);
      setApiKey("");
      toast.success("Clé API retirée.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de la suppression.");
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connexion à l&apos;agent</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="hermes-base-url">URL du proxy Hermes</Label>
          <Input
            id="hermes-base-url"
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            API compatible OpenAI exposée par <code className="font-mono">hermes proxy start</code>{" "}
            (par défaut <code className="font-mono">http://localhost:8645/v1</code>).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hermes-api-key">Clé API (optionnelle)</Label>
          <Input
            id="hermes-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={keyRegistered ? "••••••••  (clé enregistrée)" : "Laissez vide avec le proxy Hermes"}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Le proxy Hermes attache lui-même vos identifiants (OAuth Nous / xAI) — un bearer
            quelconque suffit. Renseignez une clé uniquement pour un endpoint OpenAI direct.
          </p>
          {keyRegistered && (
            <Button
              type="button"
              variant="link"
              className="min-h-11 px-0 text-destructive"
              disabled={isRemoving}
              onClick={handleRemoveKey}
            >
              {isRemoving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Retirer la clé
            </Button>
          )}
        </div>
        <Button type="button" className="h-11" disabled={isSaving} onClick={handleSave}>
          {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Enregistrer
        </Button>
      </CardContent>
    </Card>
  );
}

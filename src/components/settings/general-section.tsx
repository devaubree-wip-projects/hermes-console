"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function GeneralSection({ workspaceId, name }: { workspaceId: string; name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [savedName, setSavedName] = useState(name);
  const [isSaving, setIsSaving] = useState(false);
  const dirty = value.trim().length > 0 && value.trim() !== savedName;

  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Échec de l'enregistrement.");
      }
      setSavedName(value.trim());
      toast.success("Enregistré");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'enregistrement.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Général</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="workspace-name">Nom du workspace</Label>
          <Input
            id="workspace-name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={100}
          />
        </div>
        <Button type="button" className="h-11" disabled={!dirty || isSaving} onClick={handleSave}>
          {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Enregistrer
        </Button>
      </CardContent>
    </Card>
  );
}

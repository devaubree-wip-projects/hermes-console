"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { CanvasMarkdown } from "@/components/shared/chat/canvas/canvas-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export type CapabilityItem = {
  name: string;
  description: string;
  enabled: boolean;
  // "agent" = agent-authored or local hand-made skill, editable/toggleable from
  // the UI. "hub"/"bundled" skills are read-only here.
  provenance?: string;
};

// Skill write endpoints, only wired on the Skills page (owner-gated server-side).
export type CapabilityWrites = {
  create: string; // POST
  content: string; // GET (read) + PUT (edit)
  toggle: string; // PUT
};

function stripFrontmatter(content: string) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

export function CapabilityGrid({
  items,
  detailEndpoint,
  writes,
  canWrite = false,
}: {
  items: CapabilityItem[];
  detailEndpoint?: string;
  writes?: CapabilityWrites;
  canWrite?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<CapabilityItem | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const canManage = canWrite && Boolean(writes);
  const editable = canManage && selected?.provenance === "agent";

  useEffect(() => {
    if (!selected || !detailEndpoint) return;

    const controller = new AbortController();

    fetch(`${detailEndpoint}?name=${encodeURIComponent(selected.name)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null) as { content?: unknown; error?: unknown } | null;
        if (!response.ok) {
          throw new Error(typeof data?.error === "string" ? data.error : "Impossible de charger ce skill.");
        }
        if (typeof data?.content !== "string") {
          throw new Error("Hermes a renvoyé un contenu de skill invalide.");
        }
        setRaw(data.content);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "Impossible de charger ce skill.");
      });

    return () => controller.abort();
  }, [detailEndpoint, selected]);

  async function saveEdit() {
    if (!selected || !writes) return;
    setBusy(true);
    try {
      const response = await fetch(writes.content, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selected.name, content: draft }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return toast.error(data?.error ?? "Enregistrement impossible.");
      setRaw(draft);
      setEditing(false);
      toast.success("Skill enregistré.");
      router.refresh();
    } catch {
      toast.error("La Console est momentanément inaccessible.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSelected() {
    if (!selected || !writes) return;
    setBusy(true);
    try {
      const response = await fetch(writes.toggle, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selected.name, enabled: !selected.enabled }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return toast.error(data?.error ?? "Modification impossible.");
      setSelected({ ...selected, enabled: !selected.enabled });
      toast.success(selected.enabled ? "Skill désactivé." : "Skill activé.");
      router.refresh();
    } catch {
      toast.error("La Console est momentanément inaccessible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {canManage && writes ? (
        <div className="mb-4 flex justify-end">
          <CreateSkillDialog endpoint={writes.create} />
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => {
          const card = (
            <Card className="h-full gap-3 shadow-none transition-[background-color,box-shadow] group-hover:bg-muted/20 group-hover:ring-foreground/20">
              <CardHeader className="flex-row items-start justify-between">
                <CardTitle>{item.name}</CardTitle>
                <Badge variant={item.enabled ? "outline" : "secondary"}>{item.enabled ? "Actif" : "Inactif"}</Badge>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <p className="line-clamp-3 text-sm text-muted-foreground">{item.description}</p>
                {detailEndpoint ? (
                  <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <BookOpenText className="size-3.5" />
                    {canManage && item.provenance === "agent" ? "Lire ou éditer" : "Lire le skill"}
                  </span>
                ) : null}
              </CardContent>
            </Card>
          );

          return detailEndpoint ? (
            <button
              key={`${item.name}-${index}`}
              type="button"
              className="group cursor-pointer rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-haspopup="dialog"
              aria-label={`Lire le skill ${item.name}`}
              onClick={(event) => {
                triggerRef.current = event.currentTarget;
                setRaw(null);
                setError(null);
                setEditing(false);
                setSelected(item);
              }}
            >
              {card}
            </button>
          ) : (
            <div key={`${item.name}-${index}`}>{card}</div>
          );
        })}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelected(null); setEditing(false); } }}>
        <DialogContent
          className="max-h-[min(85dvh,900px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl"
          onCloseAutoFocus={(event) => {
            if (!triggerRef.current) return;
            event.preventDefault();
            triggerRef.current.focus();
          }}
        >
          <DialogHeader className="px-5 pt-5 pr-12 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>{selected?.name ?? "Skill"}</DialogTitle>
              {selected ? <Badge variant={selected.enabled ? "outline" : "secondary"}>{selected.enabled ? "Actif" : "Inactif"}</Badge> : null}
              {selected?.provenance && selected.provenance !== "agent" ? (
                <Badge variant="secondary">{selected.provenance}</Badge>
              ) : null}
            </div>
            <DialogDescription>{selected?.description}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-5 pb-5">
            {error ? (
              <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>
            ) : raw === null ? (
              <div className="space-y-3" aria-label="Chargement du skill">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : editing ? (
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="min-h-[45dvh] font-mono text-xs"
                aria-label="Contenu du skill"
              />
            ) : (
              <CanvasMarkdown text={stripFrontmatter(raw)} isRunning={false} />
            )}
          </div>
          {editable && raw !== null && !error ? (
            <DialogFooter className="border-t px-5 py-3">
              {editing ? (
                <>
                  <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                    Annuler
                  </Button>
                  <Button type="button" onClick={saveEdit} disabled={busy || !draft.trim()}>
                    {busy ? <Loader2 className="animate-spin" /> : null}Enregistrer
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="ghost" onClick={toggleSelected} disabled={busy}>
                    {selected?.enabled ? "Désactiver" : "Activer"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setDraft(raw); setEditing(true); }}
                    disabled={busy}
                  >
                    <Pencil />Éditer
                  </Button>
                </>
              )}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateSkillDialog({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category: category || undefined, content }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return toast.error(data?.error ?? "Création impossible.");
      setOpen(false);
      setName("");
      setCategory("");
      setContent("");
      toast.success("Skill créé.");
      router.refresh();
    } catch {
      toast.error("La Console est momentanément inaccessible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus />
          Créer un skill
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Créer un skill</DialogTitle>
          <DialogDescription>
            Le contenu (SKILL.md) est validé par le runtime Hermes (frontmatter,
            taille, scan de sécurité) avant d’être enregistré dans le profil.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="skill-name">Nom</Label>
              <Input
                id="skill-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="mon-skill"
                maxLength={200}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="skill-category">Catégorie (optionnel)</Label>
              <Input
                id="skill-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="productivity"
                maxLength={80}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="skill-content">Contenu (Markdown)</Label>
            <Textarea
              id="skill-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-[35dvh] font-mono text-xs"
              placeholder={"---\ndescription: ...\n---\n\n## Mon skill\n\nInstructions…"}
              required
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">Fermer</Button>
            </DialogClose>
            <Button type="submit" disabled={busy || !name.trim() || !content.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : null}Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

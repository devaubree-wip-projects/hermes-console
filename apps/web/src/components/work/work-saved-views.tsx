"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookmarkPlusIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SavedView = { id: string; name: string; filters: Record<string, string> };

export function WorkSavedViews({ apiBase, views }: { apiBase: string; views: SavedView[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  function apply(id: string) {
    const view = views.find((candidate) => candidate.id === id);
    if (!view) return;
    const params = new URLSearchParams(view.filters);
    router.push(`${pathname}${params.size ? `?${params}` : ""}`);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setPending(true);
    try {
      const filters = Object.fromEntries([...current.entries()].filter(([key]) => key !== "page"));
      const response = await fetch(`${apiBase}/work-views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, filters }),
      });
      const payload = await response.json();
      if (!response.ok) return toast.error(payload.error ?? "Vue impossible à enregistrer.");
      setName(""); setOpen(false); router.refresh();
    } catch { toast.error("La Console est momentanément inaccessible."); }
    finally { setPending(false); }
  }

  if (open) return <form onSubmit={save} className="flex w-full gap-2 xl:w-auto"><Input aria-label="Nom de la vue" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ma vue" className="w-44" maxLength={80} /><Button type="submit" variant="outline" disabled={pending || !name.trim()}>{pending ? <Loader2Icon className="animate-spin" /> : <BookmarkPlusIcon />}Enregistrer</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Fermer</Button></form>;
  return <div className="flex gap-2">{views.length ? <Select onValueChange={apply}><SelectTrigger className="w-44" aria-label="Ouvrir une vue enregistrée"><SelectValue placeholder="Vues enregistrées" /></SelectTrigger><SelectContent>{views.map((view) => <SelectItem key={view.id} value={view.id}>{view.name}</SelectItem>)}</SelectContent></Select> : null}<Button type="button" variant="outline" onClick={() => setOpen(true)}><BookmarkPlusIcon />Enregistrer la vue</Button></div>;
}

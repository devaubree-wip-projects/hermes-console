"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorkSavedViews } from "@/components/work/work-saved-views";

type ToolbarProps = {
  apiBase: string;
  projects: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; name: string }>;
  labels: Array<{ id: string; name: string }>;
  savedViews: Array<{ id: string; name: string; filters: Record<string, string> }>;
};

const filterKeys = ["status", "priority", "project", "agent", "label", "creator", "due"] as const;

export function WorkListToolbar({ apiBase, projects, agents, labels, savedViews }: ToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  const [query, setQuery] = useState(current.get("q") ?? "");
  const activeFilterCount = filterKeys.filter((key) => Boolean(current.get(key))).length;

  function update(values: Record<string, string>) {
    const params = new URLSearchParams(current.toString());
    params.delete("page");
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ""}`);
  }

  function clearFilters() {
    update(Object.fromEntries(filterKeys.map((key) => [key, ""])));
  }

  return (
    <div className="flex flex-col gap-2 border-b px-4 py-2.5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <form className="relative w-full sm:w-80 xl:w-96" onSubmit={(event) => { event.preventDefault(); update({ q: query }); }}>
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Rechercher les tâches" value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 pl-8 pr-8 text-xs" placeholder="Rechercher une tâche…" />
          {query ? <button type="button" aria-label="Effacer la recherche" onClick={() => { setQuery(""); update({ q: "" }); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><XIcon className="size-3.5" /></button> : null}
        </form>
        <Popover
          align="start"
          width={760}
          className="rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10"
          trigger={({ ref, onClick, "aria-expanded": ariaExpanded }) => (
            <Button ref={ref} type="button" size="sm" variant="outline" onClick={onClick} aria-expanded={ariaExpanded} aria-label="Filtrer les tâches">
              <SlidersHorizontalIcon />Filtres
              {activeFilterCount ? <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{activeFilterCount}</Badge> : null}
            </Button>
          )}
        >
          <div className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-4 border-b pb-3">
              <div><p className="text-sm font-medium">Filtrer les tâches</p><p className="mt-0.5 text-xs text-muted-foreground">Les résultats sont mis à jour dès qu’un filtre change.</p></div>
              {activeFilterCount ? <Button type="button" variant="ghost" size="xs" onClick={clearFilters}><XIcon />Réinitialiser</Button> : null}
            </div>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <Select value={current.get("status") ?? "all"} onValueChange={(value) => update({ status: value === "all" ? "" : value })}><SelectTrigger className="w-full" aria-label="Filtrer par statut"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="backlog">Backlog</SelectItem><SelectItem value="todo">À faire</SelectItem><SelectItem value="in_progress">En cours</SelectItem><SelectItem value="blocked">Bloquées</SelectItem><SelectItem value="review">En revue</SelectItem><SelectItem value="done">Terminées</SelectItem><SelectItem value="cancelled">Annulées</SelectItem></SelectContent></Select>
              <Select value={current.get("priority") ?? "all"} onValueChange={(value) => update({ priority: value === "all" ? "" : value })}><SelectTrigger className="w-full" aria-label="Filtrer par priorité"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toutes priorités</SelectItem><SelectItem value="urgent">Urgente</SelectItem><SelectItem value="high">Haute</SelectItem><SelectItem value="medium">Moyenne</SelectItem><SelectItem value="low">Basse</SelectItem><SelectItem value="none">Sans priorité</SelectItem></SelectContent></Select>
              <Select value={current.get("project") ?? "all"} onValueChange={(value) => update({ project: value === "all" ? "" : value })}><SelectTrigger className="w-full" aria-label="Filtrer par projet"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les projets</SelectItem>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select>
              <Select value={current.get("agent") ?? "all"} onValueChange={(value) => update({ agent: value === "all" ? "" : value })}><SelectTrigger className="w-full" aria-label="Filtrer par agent"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les agents</SelectItem>{agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent></Select>
              <Select value={current.get("label") ?? "all"} onValueChange={(value) => update({ label: value === "all" ? "" : value })}><SelectTrigger className="w-full" aria-label="Filtrer par label"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les labels</SelectItem>{labels.map((label) => <SelectItem key={label.id} value={label.id}>{label.name}</SelectItem>)}</SelectContent></Select>
              <Select value={current.get("creator") ?? "all"} onValueChange={(value) => update({ creator: value === "all" ? "" : value })}><SelectTrigger className="w-full" aria-label="Filtrer par créateur"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les créateurs</SelectItem><SelectItem value="me">Créées par moi</SelectItem></SelectContent></Select>
              <Select value={current.get("due") ?? "all"} onValueChange={(value) => update({ due: value === "all" ? "" : value })}><SelectTrigger className="w-full" aria-label="Filtrer par échéance"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toutes échéances</SelectItem><SelectItem value="overdue">En retard</SelectItem><SelectItem value="today">Aujourd’hui</SelectItem><SelectItem value="week">Cette semaine</SelectItem><SelectItem value="none">Sans échéance</SelectItem></SelectContent></Select>
            </div>
          </div>
        </Popover>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <WorkSavedViews apiBase={apiBase} views={savedViews} />
      </div>
    </div>
  );
}

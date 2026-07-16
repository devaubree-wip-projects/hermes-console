"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BellIcon, LogOutIcon, SendIcon, SettingsIcon, UserIcon } from "lucide-react";
import { CustomSidebarTrigger } from "@/components/v1-xulux/custom-sidebar-trigger";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROUTE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  agents: "Agents",
  approvals: "Validations",
  automations: "Automatisations",
  files: "Fichiers",
  events: "Event Logs",
  integrations: "Intégrations",
  inbox: "Inbox",
  knowledge: "Connaissances",
  models: "Modèles",
  projects: "Projets",
  settings: "Paramètres",
  skills: "Skills",
  tasks: "Tâches",
  team: "Membres",
  tools: "Outils",
};

function routeTitle(pathname: string, workspaceBase: string) {
  const path = pathname.slice(workspaceBase.length).replace(/^\//, "");
  const [section, detail] = path.split("/");
  if (section === "agents" && detail === "new") return "Créer un agent";
  if (section === "tasks" && detail) return "Détail de la tâche";
  if (section === "projects" && detail) return "Détail du projet";
  return ROUTE_TITLES[section] ?? "Hermes Console";
}

export function SiteHeader({
  workspaceBase,
  user,
}: {
  workspaceBase: string;
  user: { name: string; email: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const title = routeTitle(pathname, workspaceBase);
  const initial = user.name.trim().charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-2.5">
      <CustomSidebarTrigger className="size-8 text-muted-foreground hover:text-foreground" />
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
      <h1 className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em]">{title}</h1>
      <div className="min-w-0 flex-1" />
      <div className="flex shrink-0 items-center gap-2">
        <Button asChild size="icon-sm" variant="outline">
          <Link href={`${workspaceBase}/d/chat`} aria-label="Ouvrir une nouvelle session">
            <SendIcon />
          </Link>
        </Button>
        <Button asChild size="icon-sm" variant="outline">
          <Link href={`${workspaceBase}/approvals`} aria-label="Ouvrir les validations">
            <BellIcon />
          </Link>
        </Button>
        <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label="Menu du compte">
            <Avatar className="size-8">
              <AvatarFallback className="bg-foreground text-xs font-medium text-background">{initial}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-sm font-medium text-foreground">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href={`${workspaceBase}/settings/members`}><UserIcon />Membres</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`${workspaceBase}/settings/chat`}><SettingsIcon />Paramètres</Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => void logout()}>
              <LogOutIcon />Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BellIcon, LogOutIcon, SendIcon, SettingsIcon, UserIcon } from "lucide-react";
import { CustomSidebarTrigger } from "@/components/v1-xulux/custom-sidebar-trigger";
import { SearchCommandTrigger } from "@/components/v1-xulux/search-command";
import {
  productRouteHref,
  resolveProductRouteTitle,
  withAgentContext,
} from "@/components/product/product-navigation";
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

export function SiteHeader({
  activeAgentId,
  defaultAgentId,
  workspaceBase,
  user,
}: {
  activeAgentId?: string;
  defaultAgentId?: string;
  workspaceBase: string;
  user: { name: string; email: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const title = resolveProductRouteTitle(pathname, workspaceBase);
  const initial = user.name.trim().charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase();
  const chatBase = productRouteHref(workspaceBase, "sessions");
  const routeWithAgent = (href: string) => (
    withAgentContext(href, activeAgentId, defaultAgentId)
  );
  const chatHref = routeWithAgent(chatBase);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="relative flex h-12 shrink-0 items-center gap-2 px-2.5">
      <CustomSidebarTrigger className="size-8 text-muted-foreground hover:text-foreground" />
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
      <h1 className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em]">{title}</h1>
      <div className="pointer-events-none absolute inset-x-0 flex justify-center px-32">
        <div className="pointer-events-auto w-full max-w-sm">
          <SearchCommandTrigger />
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button asChild size="icon-sm" variant="outline">
          <Link href={chatHref} aria-label="Ouvrir une nouvelle session">
            <SendIcon />
          </Link>
        </Button>
        <Button asChild size="icon-sm" variant="outline">
          <Link href={routeWithAgent(productRouteHref(workspaceBase, "inbox"))} aria-label="Ouvrir l’Inbox">
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
                <Link href={routeWithAgent(productRouteHref(workspaceBase, "settings-members"))}><UserIcon />Membres</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={routeWithAgent(productRouteHref(workspaceBase, "settings-chat"))}><SettingsIcon />Paramètres</Link>
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

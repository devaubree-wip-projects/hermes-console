"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Check,
  ChevronsUpDown,
  FolderOpen,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  MessageSquare,
  Monitor,
  Moon,
  PanelLeft,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ShellWorkspace = { id: string; name: string };
export type ShellUser = { name: string; email: string };

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: number;
};

function navItems(workspaceId: string, pendingApprovals: number): NavItem[] {
  const base = `/w/${workspaceId}`;
  return [
    { href: base, label: "Tableau de bord", icon: LayoutDashboard, exact: true },
    { href: `${base}/chat`, label: "Chat", icon: MessageSquare },
    { href: `${base}/tasks`, label: "Tâches", icon: ListTodo },
    { href: `${base}/files`, label: "Fichiers", icon: FolderOpen },
    { href: `${base}/knowledge`, label: "Connaissances", icon: BookOpen },
    { href: `${base}/approvals`, label: "Validations", icon: ShieldCheck, badge: pendingApprovals },
    { href: `${base}/settings`, label: "Réglages", icon: Settings },
  ];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function isActive(item: NavItem, pathname: string): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function WorkspaceSwitcher({
  workspace,
  workspaces,
  collapsed,
}: {
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
  collapsed: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-11 w-full gap-2 bg-background font-medium",
            collapsed ? "justify-center px-0" : "justify-between px-3",
          )}
          aria-label="Changer de workspace"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[image:var(--gradient-primary)] text-[11px] font-semibold text-white">
              {initials(workspace.name)}
            </span>
            {!collapsed && <span className="truncate">{workspace.name}</span>}
          </span>
          {!collapsed && <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} asChild>
            <Link href={`/w/${w.id}`} className="flex items-center gap-2">
              <span className="truncate">{w.name}</span>
              {w.id === workspace.id && <Check className="ml-auto size-4" />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/workspaces/new">
            <Plus className="size-4" />
            Nouveau workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user, collapsed }: { user: ShellUser; collapsed: boolean }) {
  const router = useRouter();
  const { setTheme } = useTheme();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-12 w-full gap-3",
            collapsed ? "justify-center px-0" : "justify-start px-2",
          )}
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-background text-xs">{initials(user.name)}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <span className="flex min-w-0 flex-col items-start">
              <span className="truncate text-sm font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Thème</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="size-4" /> Clair
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="size-4" /> Sombre
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="size-4" /> Système
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} variant="destructive">
          <LogOut className="size-4" /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-11 items-center gap-3 rounded-[10px] text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "bg-background text-foreground shadow-xs"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", active && "text-primary")} />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && item.badge !== undefined && item.badge > 0 && (
        <Badge className="tabular-nums" variant="secondary">
          {item.badge}
        </Badge>
      )}
      {collapsed && item.badge !== undefined && item.badge > 0 && (
        <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />
      )}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative block">{link}</span>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function SidebarInner({
  workspace,
  workspaces,
  user,
  items,
  pathname,
  collapsed,
  onNavigate,
}: {
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
  user: ShellUser;
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <WorkspaceSwitcher workspace={workspace} workspaces={workspaces} collapsed={collapsed} />
      <nav aria-label="Navigation principale" className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item, pathname)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
      <div className="border-t pt-2 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <UserMenu user={user} collapsed={collapsed} />
      </div>
    </div>
  );
}

export function AppShell({
  user,
  workspace,
  workspaces,
  pendingApprovals,
  children,
}: {
  user: ShellUser;
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
  pendingApprovals: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const items = navItems(workspace.id, pendingApprovals);
  const activeLabel = items.find((i) => isActive(i, pathname))?.label ?? "Espace client";

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 border-r bg-sidebar transition-[width] duration-200 md:block",
          collapsed ? "w-[76px]" : "w-[260px]",
        )}
      >
        <div className="h-full">
          <SidebarInner
            workspace={workspace}
            workspaces={workspaces}
            user={user}
            items={items}
            pathname={pathname}
            collapsed={collapsed}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header (fixed row above the scrollable main) */}
        <header className="flex h-[var(--navbar-h)] shrink-0 items-center gap-2 border-b bg-background px-2 pt-[env(safe-area-inset-top)] sm:px-4">
          {/* Mobile: drawer trigger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 md:hidden"
                aria-label="Ouvrir le menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[264px] bg-sidebar p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <SidebarInner
                workspace={workspace}
                workspaces={workspaces}
                user={user}
                items={items}
                pathname={pathname}
                collapsed={false}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>

          {/* Desktop: collapse toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden size-9 md:inline-flex"
            aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
            aria-pressed={collapsed}
            onClick={() => setCollapsed((v) => !v)}
          >
            <PanelLeft className="size-[18px]" />
          </Button>

          <Breadcrumb className="min-w-0">
            <BreadcrumbList>
              <BreadcrumbItem className="hidden min-[420px]:block">
                <span className="truncate text-muted-foreground">{workspace.name}</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden min-[420px]:block" />
              <BreadcrumbItem>
                <BreadcrumbPage className="truncate font-medium">{activeLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

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
  Plus,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
    { href: base, label: "Dashboard", icon: LayoutDashboard, exact: true },
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

function WorkspaceSwitcher({
  workspace,
  workspaces,
}: {
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-11 w-full justify-between px-3 font-medium"
          aria-label="Changer de workspace"
        >
          <span className="truncate">{workspace.name}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
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

function UserMenu({ user }: { user: ShellUser }) {
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
        <Button variant="ghost" className="h-12 w-full justify-start gap-3 px-3">
          <Avatar className="size-8">
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col items-start">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
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

function SidebarNav({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Navigation principale" className="flex flex-col gap-1 px-2">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <Badge variant="secondary" className="tabular-nums">
                {item.badge}
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
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
  const items = navItems(workspace.id, pendingApprovals);

  const sidebarInner = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="p-2">
        <WorkspaceSwitcher workspace={workspace} workspaces={workspaces} />
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        <SidebarNav items={items} pathname={pathname} onNavigate={onNavigate} />
      </div>
      <div className="border-t p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <UserMenu user={user} />
      </div>
    </div>
  );

  return (
    <div className="h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden border-r bg-sidebar lg:block">{sidebarInner()}</aside>

      <div className="flex h-dvh flex-col lg:h-auto lg:min-h-0">
        {/* Mobile topbar */}
        <header className="flex h-[var(--navbar-h)] shrink-0 items-center gap-2 border-b px-2 pt-[env(safe-area-inset-top)] lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11" aria-label="Ouvrir le menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              {sidebarInner(() => setMobileOpen(false))}
            </SheetContent>
          </Sheet>
          <span className="truncate text-sm font-semibold">{workspace.name}</span>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

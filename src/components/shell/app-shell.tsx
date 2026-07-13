"use client";

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
  MessageSquare,
  Plus,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ModeToggle } from "@/components/shell/mode-toggle";

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
}: {
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
}) {
  const { isMobile } = useSidebar();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              aria-label="Changer de workspace"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-[image:var(--gradient-primary)] text-xs font-semibold text-white">
                {initials(workspace.name)}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{workspace.name}</span>
                <span className="truncate text-xs text-muted-foreground">Espace client</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            align="start"
            side={isMobile ? "bottom" : "right"}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem key={w.id} asChild>
                <Link href={`/w/${w.id}`} className="gap-2">
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
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NavMain({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) => {
          const active = isActive(item, pathname);
          const Icon = item.icon;
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                <Link href={item.href}>
                  <Icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
              {item.badge !== undefined && item.badge > 0 && (
                <SidebarMenuBadge className="text-primary">{item.badge}</SidebarMenuBadge>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function NavUser({ user }: { user: ShellUser }) {
  const router = useRouter();
  const { isMobile } = useSidebar();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-background text-xs">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            align="end"
            side={isMobile ? "bottom" : "right"}
          >
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
              {user.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} variant="destructive">
              <LogOut className="size-4" /> Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function AppSidebar({
  user,
  workspace,
  workspaces,
  items,
  pathname,
}: {
  user: ShellUser;
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
  items: NavItem[];
  pathname: string;
}) {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher workspace={workspace} workspaces={workspaces} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={items} pathname={pathname} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
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
  const items = navItems(workspace.id, pendingApprovals);
  const activeLabel = items.find((i) => isActive(i, pathname))?.label ?? "Espace client";

  return (
    <SidebarProvider className="h-dvh overflow-hidden">
      <AppSidebar
        user={user}
        workspace={workspace}
        workspaces={workspaces}
        items={items}
        pathname={pathname}
      />
      <SidebarInset className="min-h-0 overflow-hidden">
        <header className="flex h-[var(--navbar-h)] shrink-0 items-center gap-2 border-b px-3 sm:px-4">
          <SidebarTrigger className="-ml-1 size-9" />
          <div aria-hidden className="mr-1 h-4 w-px shrink-0 bg-border" />
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
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

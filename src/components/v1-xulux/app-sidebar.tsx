"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { LogoIcon } from "@/components/v1-xulux/logo"
import { useChatRunStore } from "@/lib/shared/chat/chat-run-store"
import { CustomSidebarTrigger } from "@/components/v1-xulux/custom-sidebar-trigger"
import { cn } from "@/lib/utils"
import { Button } from "@/components/v1-xulux/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/v1-xulux/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/v1-xulux/ui/sidebar"
import { SessionUsageCard } from "@/components/v1-xulux/session-usage-card"
import { EventLogsCard } from "@/components/v1-xulux/event-logs-card"
import { HermesStatusCard } from "@/components/v1-xulux/hermes-status-card"
import { ThemeToggle } from "@/components/v1-xulux/theme-toggle"
import { useSearchCommand } from "@/components/v1-xulux/search-command"
import {
  ChevronRightIcon,
  BotIcon,
  CheckCircle2Icon,
  Clock3Icon,
  FileTextIcon,
  GaugeIcon,
  LibraryIcon,
  ListTreeIcon,
  Loader2Icon,
  MessageCircleIcon,
  PlugIcon,
  PlusIcon,
  SearchIcon,
  ServerIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react"

export type SidebarNavItem = {
  title: string
  url: string
  icon: ReactNode
  items?: Array<{ title: string; url: string }>
}

type SidebarSection = {
  label: string
  items: SidebarNavItem[]
}

export type WorkspaceAgentOption = {
  id: string
  name: string
  slug: string
  runtimeState: "ready" | "setup_required" | "error"
  installationName: string | null
  installationStatus: "pending_enrollment" | "checking" | "ready" | "degraded" | "offline" | "incompatible" | "upgrading" | "rollback_required" | "revoked" | null
  hermesVersion: string | null
}

function isActive(pathname: string, url: string) {
  return pathname === url || pathname.startsWith(`${url}/`)
}

export function AppSidebar({
  agents,
  workspaceBase,
  workspaceName,
}: {
  agents: WorkspaceAgentOption[]
  workspaceBase: string
  workspaceName?: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setOpen } = useSearchCommand()
  const hasRunningChat = useChatRunStore((s) => s.runningThreadIds.length > 0)
  const chatBase = `${workspaceBase}/d/chat`
  const requestedAgentId = searchParams.get("agentId")
  const activeAgentId = requestedAgentId
    && agents.some((agent) => agent.id === requestedAgentId)
    ? requestedAgentId
    : agents[0]?.id
  const activeAgent = agents.find((agent) => agent.id === activeAgentId)
  const chatBaseWithAgent = activeAgentId && activeAgentId !== agents[0]?.id
    ? `${chatBase}?agentId=${encodeURIComponent(activeAgentId)}`
    : chatBase

  const navSections: SidebarSection[] = [
    {
      label: workspaceName ?? "Workspace",
      items: [
        {
          title: "Dashboard",
          url: `${workspaceBase}/dashboard`,
          icon: <GaugeIcon />,
        },
        {
          title: "Sessions",
          url: chatBase,
          icon: <MessageCircleIcon />,
        },
      ],
    },
    {
      label: "Travail",
      items: [
        { title: "Tâches", url: `${workspaceBase}/tasks`, icon: <Clock3Icon /> },
        { title: "Validations", url: `${workspaceBase}/approvals`, icon: <CheckCircle2Icon /> },
        { title: "Fichiers", url: `${workspaceBase}/files`, icon: <FileTextIcon /> },
        { title: "Connaissances", url: `${workspaceBase}/knowledge`, icon: <LibraryIcon /> },
      ],
    },
    {
      label: "Capacités",
      items: [
        { title: "Skills", url: `${workspaceBase}/skills`, icon: <SparklesIcon /> },
        { title: "Automatisations", url: `${workspaceBase}/automations`, icon: <BotIcon /> },
      ],
    },
    {
      label: "Administration",
      items: [
        { title: "Installations", url: `${workspaceBase}/installations`, icon: <ServerIcon /> },
        { title: "Intégrations", url: `${workspaceBase}/integrations`, icon: <PlugIcon /> },
        { title: "Event Logs", url: `${workspaceBase}/events`, icon: <ListTreeIcon /> },
        { title: "Paramètres", url: `${workspaceBase}/settings/chat`, icon: <SettingsIcon /> },
      ],
    },
  ]

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="h-14 flex-row items-center">
        <div className="group/logo relative flex w-full items-center gap-1 group-data-[collapsible=icon]:w-8">
          <SidebarMenuButton asChild className="min-w-0 flex-1">
            <Link href={`${workspaceBase}/dashboard`}>
              <LogoIcon className="transition-opacity group-data-[collapsible=icon]:group-hover/logo:opacity-0" />
              <span className="font-medium">Hermes Console</span>
            </Link>
          </SidebarMenuButton>
          <CustomSidebarTrigger
            className={cn(
              "ms-auto shrink-0",
              "group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:inset-0 group-data-[collapsible=icon]:m-auto group-data-[collapsible=icon]:size-8",
              "group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:transition-opacity",
              "group-data-[collapsible=icon]:group-hover/logo:pointer-events-auto group-data-[collapsible=icon]:group-hover/logo:opacity-100"
            )}
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="gap-2 pb-0">
          <label
            className="text-sidebar-foreground/70 px-1 text-xs font-medium group-data-[collapsible=icon]:sr-only"
            htmlFor="workspace-agent-switcher"
          >
            Agent actif
          </label>
          <Select
            disabled={agents.length === 0}
            onValueChange={(agentId) => {
              router.push(
                agentId === agents[0]?.id
                  ? chatBase
                  : `${chatBase}?agentId=${encodeURIComponent(agentId)}`,
              )
            }}
            value={activeAgentId}
          >
            <SelectTrigger
              aria-label="Agent actif"
              className="w-full border-sidebar-border bg-sidebar shadow-none group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:[&_[data-slot=select-value]]:hidden group-data-[collapsible=icon]:[&>svg:last-child]:hidden"
              id="workspace-agent-switcher"
              size="sm"
            >
              <BotIcon className="size-4" />
              <SelectValue placeholder="Aucun agent" />
            </SelectTrigger>
            <SelectContent align="start">
              {agents.map((agent) => (
                <SelectItem key={agent.id} textValue={agent.name} value={agent.id}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        agent.runtimeState === "ready" && "bg-emerald-500",
                        agent.runtimeState === "setup_required" && "bg-amber-500",
                        agent.runtimeState === "error" && "bg-destructive",
                      )}
                    />
                    <span className="truncate">{agent.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              asChild
              className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
              tooltip="Quick Create"
            >
              <Link href={agents.length > 0 ? chatBaseWithAgent : `${workspaceBase}/agents/new`}>
                <PlusIcon />
                <span>Nouvelle conversation</span>
              </Link>
            </SidebarMenuButton>
            <Button
              aria-label="Rechercher des sessions"
              className="size-8 group-data-[collapsible=icon]:opacity-0"
              onClick={() => setOpen(true)}
              size="icon"
              variant="outline"
            >
              <SearchIcon />
              <span className="sr-only">Rechercher des sessions</span>
            </Button>
          </SidebarMenuItem>
        </SidebarGroup>

        {navSections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarMenu>
              {section.items.map((item) => {
                const active = item.title === "Paramètres"
                  ? pathname.startsWith(`${workspaceBase}/settings`)
                  : isActive(pathname, item.url)
                const itemUrl = item.url === chatBase ? chatBaseWithAgent : item.url
                const defaultOpen =
                  active ||
                  item.items?.some((sub) => pathname === sub.url) === true

                return (
                  <Collapsible asChild defaultOpen={defaultOpen} key={item.title}>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                      >
                        <Link href={itemUrl}>
                          {item.icon}
                          <span>{item.title}</span>
                          {item.title === "Agents & conversations" && hasRunningChat ? (
                            <Loader2Icon
                              className="text-muted-foreground ms-auto size-3.5 shrink-0 animate-spin"
                              aria-label="Conversation en cours"
                            />
                          ) : null}
                        </Link>
                      </SidebarMenuButton>
                      {item.items?.length ? (
                        <>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuAction className="data-[state=open]:rotate-90">
                              <ChevronRightIcon />
                              <span className="sr-only">Toggle</span>
                            </SidebarMenuAction>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {item.items.map((subItem) => (
                                <SidebarMenuSubItem key={subItem.title}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={pathname === subItem.url}
                                  >
                                    <Link href={subItem.url}>
                                      <span>{subItem.title}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </>
                      ) : null}
                    </SidebarMenuItem>
                  </Collapsible>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SessionUsageCard
          agentSlug={activeAgent?.slug}
          workspaceBase={workspaceBase}
        />
        <EventLogsCard workspaceBase={workspaceBase} />
        <HermesStatusCard
          agent={activeAgent}
          workspaceBase={workspaceBase}
        />
        <SidebarMenu className="mt-2">
          <ThemeToggle />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

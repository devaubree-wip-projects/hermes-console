"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LogoIcon } from "@/components/v1-xulux/logo"
import type { WorkspaceAgentOption } from "@/components/v1-xulux/app-shell-types"
import { useChatRunStore } from "@/lib/shared/chat/chat-run-store"
import { CustomSidebarTrigger } from "@/components/v1-xulux/custom-sidebar-trigger"
import { cn } from "@/lib/utils"
import {
  getPrimaryProductNavigation,
  isProductRouteActive,
  productRouteHref,
  withAgentContext,
  type ProductRouteId,
} from "@/components/product/product-navigation"
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/v1-xulux/ui/sidebar"
import { SessionUsageCard } from "@/components/v1-xulux/session-usage-card"
import { HermesStatusCard } from "@/components/v1-xulux/hermes-status-card"
import { ThemeToggle } from "@/components/v1-xulux/theme-toggle"
import { WorkGuideDialog } from "@/components/work/work-guide-dialog"
import {
  BriefcaseBusinessIcon,
  ChevronRightIcon,
  BotIcon,
  GaugeIcon,
  LibraryIcon,
  Loader2Icon,
  MessageCircleIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react"

const RUNTIME_STATE_LABELS: Record<
  WorkspaceAgentOption["runtimeState"],
  string
> = {
  ready: "Prêt",
  setup_required: "À configurer",
  error: "Erreur",
}

function ProductRouteIcon({ routeId }: { routeId: ProductRouteId }) {
  switch (routeId) {
    case "dashboard":
      return <GaugeIcon />
    case "sessions":
      return <MessageCircleIcon />
    case "agents":
      return <BotIcon />
    case "files":
      return <LibraryIcon />
    case "settings-chat":
      return <SettingsIcon />
    default:
      return null
  }
}

export function AppSidebar({
  agents,
  activeAgentId,
  defaultAgentId,
  workspaceBase,
  organizationName,
  inboxUnreadCount = 0,
}: {
  agents: WorkspaceAgentOption[]
  activeAgentId?: string
  defaultAgentId?: string
  workspaceBase: string
  organizationName?: string
  inboxUnreadCount?: number
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [workGuideOpen, setWorkGuideOpen] = useState(false)
  const hasRunningChat = useChatRunStore((s) => s.runningThreadIds.length > 0)
  const chatBase = productRouteHref(workspaceBase, "sessions")
  const activeAgent = agents.find((agent) => agent.id === activeAgentId)
  const routeWithAgent = (href: string) => (
    withAgentContext(href, activeAgentId, defaultAgentId)
  )
  const chatBaseWithAgent = routeWithAgent(chatBase)
  const mainNavigation = getPrimaryProductNavigation(workspaceBase, "main")
  const workNavigation = getPrimaryProductNavigation(workspaceBase, "work")
  const utilityNavigation = getPrimaryProductNavigation(workspaceBase, "utility")
  const workActive = workNavigation.some((route) => (
    isProductRouteActive(pathname, workspaceBase, route.id)
  ))

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="h-14 flex-row items-center">
        <div className="group/logo relative flex w-full items-center gap-1 group-data-[collapsible=icon]:w-8">
          <SidebarMenuButton asChild className="min-w-0 flex-1">
            <Link href={routeWithAgent(productRouteHref(workspaceBase, "dashboard"))}>
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
          <div className="flex items-center justify-between gap-2 px-1 group-data-[collapsible=icon]:sr-only">
            <label
              className="text-xs font-medium text-sidebar-foreground/70"
              htmlFor="workspace-agent-switcher"
            >
              Agent actif
            </label>
            <Link
              className="text-[11px] font-medium text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground"
              href={routeWithAgent(productRouteHref(workspaceBase, "agents"))}
            >
              Gérer
            </Link>
          </div>
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
                    <span className="ms-auto text-[10px] text-muted-foreground">
                      {RUNTIME_STATE_LABELS[agent.runtimeState]}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
              tooltip="Nouvelle conversation"
            >
              <Link href={agents.length > 0 ? chatBaseWithAgent : productRouteHref(workspaceBase, "agent-new")}>
                <PlusIcon />
                <span>Nouvelle conversation</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{organizationName ?? "Organisation"}</SidebarGroupLabel>
          <SidebarMenu>
            {mainNavigation.map((route) => {
              const href = route.id === "sessions"
                ? chatBaseWithAgent
                : routeWithAgent(route.href)
              return (
                <SidebarMenuItem key={route.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={isProductRouteActive(pathname, workspaceBase, route.id)}
                    tooltip={route.title}
                  >
                    <Link href={href}>
                      <ProductRouteIcon routeId={route.id} />
                      <span>{route.title}</span>
                      {route.id === "sessions" && hasRunningChat ? (
                        <Loader2Icon
                          className="text-muted-foreground ms-auto size-3.5 shrink-0 animate-spin"
                          aria-label="Conversation en cours"
                        />
                      ) : null}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarMenu>
            <Collapsible
              asChild
              className="group/collapsible"
              defaultOpen
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton isActive={workActive} tooltip="Travail">
                    <BriefcaseBusinessIcon />
                    <span>Travail</span>
                    <ChevronRightIcon className="ms-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-visible">
                  <SidebarMenuSub>
                    {workNavigation.map((route) => (
                      <SidebarMenuSubItem key={route.id}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isProductRouteActive(
                            pathname,
                            workspaceBase,
                            route.id,
                          )}
                        >
                          <Link href={routeWithAgent(route.href)}>
                            <span>{route.title}</span>
                            {route.id === "inbox" && inboxUnreadCount > 0 ? (
                              <span
                                className="ms-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-medium tabular-nums text-white"
                                aria-label={`${inboxUnreadCount} élément${inboxUnreadCount > 1 ? "s" : ""} non lu${inboxUnreadCount > 1 ? "s" : ""}`}
                              >
                                {inboxUnreadCount > 99 ? "99+" : inboxUnreadCount}
                              </span>
                            ) : null}
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        type="button"
                        onClick={() => setWorkGuideOpen(true)}
                      >
                        <span>Guide Travail</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarMenu>
            {utilityNavigation.map((route) => (
              <SidebarMenuItem key={route.id}>
                <SidebarMenuButton
                  asChild
                  isActive={isProductRouteActive(pathname, workspaceBase, route.id)}
                  tooltip={route.title}
                >
                  <Link href={routeWithAgent(route.href)}>
                    <ProductRouteIcon routeId={route.id} />
                    <span>{route.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SessionUsageCard
          agentSlug={activeAgent?.slug}
          workspaceBase={workspaceBase}
        />
        <HermesStatusCard
          agent={activeAgent}
          workspaceBase={workspaceBase}
        />
        <SidebarMenu className="mt-2">
          <ThemeToggle />
        </SidebarMenu>
      </SidebarFooter>
      <WorkGuideDialog
        open={workGuideOpen}
        onOpenChange={setWorkGuideOpen}
        workspaceBase={workspaceBase}
      />
    </Sidebar>
  )
}

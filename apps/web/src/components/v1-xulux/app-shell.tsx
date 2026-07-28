"use client"

import type { ReactNode } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { SearchCommandProvider } from "@/components/v1-xulux/search-command"
import { Toaster } from "@/components/ui/sonner"
import { SidebarInset, SidebarProvider } from "@/components/v1-xulux/ui/sidebar"
import { AppSidebar } from "@/components/v1-xulux/app-sidebar"
import type { WorkspaceAgentOption } from "@/components/v1-xulux/app-shell-types"
import { SiteHeader } from "@/components/v1-xulux/site-header"

export function AppShell({
	children,
	workspaceBase,
	organizationName,
	agents,
	user,
	inboxUnreadCount,
}: {
	children?: ReactNode
	workspaceBase: string
	organizationName?: string
	agents: WorkspaceAgentOption[]
	user: { name: string; email: string }
	inboxUnreadCount?: number
}) {
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const requestedAgentId = searchParams.get("agentId")
	const defaultAgentId = agents[0]?.id
	const activeAgentId = requestedAgentId
		&& agents.some((agent) => agent.id === requestedAgentId)
		? requestedAgentId
		: defaultAgentId
	const isChatRoute = pathname.startsWith(`${workspaceBase}/d/chat`)
	const isSettingsRoute = pathname.startsWith(`${workspaceBase}/settings`)

	if (isSettingsRoute) {
		return (
			<SearchCommandProvider
				activeAgentId={activeAgentId}
				defaultAgentId={defaultAgentId}
				workspaceBase={workspaceBase}
			>
				<div className="h-svh overflow-hidden bg-background">{children}</div>
			</SearchCommandProvider>
		)
	}

	return (
		<SearchCommandProvider
			activeAgentId={activeAgentId}
			defaultAgentId={defaultAgentId}
			workspaceBase={workspaceBase}
		>
			{!isChatRoute ? <Toaster position="bottom-right" /> : null}
			<div className="overflow-hidden">
				<SidebarProvider defaultOpen className="relative h-svh">
					<AppSidebar
						agents={agents}
						activeAgentId={activeAgentId}
						defaultAgentId={defaultAgentId}
						workspaceBase={workspaceBase}
						organizationName={organizationName}
						inboxUnreadCount={inboxUnreadCount}
					/>
					<SidebarInset className="min-w-0 bg-sidebar shadow-none md:rounded-none md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:shadow-none">
						<div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-sidebar">
							{isChatRoute ? children : (
								<div className="flex min-h-0 flex-1 p-3">
									<section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
										<SiteHeader
											activeAgentId={activeAgentId}
											defaultAgentId={defaultAgentId}
											workspaceBase={workspaceBase}
											user={user}
										/>
										<div className="min-h-0 flex-1 overflow-hidden">{children}</div>
									</section>
								</div>
							)}
						</div>
					</SidebarInset>
				</SidebarProvider>
			</div>
		</SearchCommandProvider>
	)
}

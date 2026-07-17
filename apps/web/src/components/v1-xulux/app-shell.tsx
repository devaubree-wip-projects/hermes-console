"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { SearchCommandProvider } from "@/components/v1-xulux/search-command"
import { Toaster } from "@/components/ui/sonner"
import { SidebarInset, SidebarProvider } from "@/components/v1-xulux/ui/sidebar"
import {
	AppSidebar,
	type WorkspaceAgentOption,
} from "@/components/v1-xulux/app-sidebar"
import { SiteHeader } from "@/components/v1-xulux/site-header"

export function AppShell({
	children,
	workspaceBase,
	workspaceName,
	agents,
	user,
}: {
	children?: ReactNode
	workspaceBase: string
	workspaceName?: string
	agents: WorkspaceAgentOption[]
	user: { name: string; email: string }
}) {
	const pathname = usePathname()
	const isChatRoute = pathname.startsWith(`${workspaceBase}/d/chat`)
	const isSettingsRoute = pathname.startsWith(`${workspaceBase}/settings`)

	if (isSettingsRoute) {
		return (
			<SearchCommandProvider>
				<div className="h-svh overflow-hidden bg-background">{children}</div>
			</SearchCommandProvider>
		)
	}

	return (
		<SearchCommandProvider>
			{!isChatRoute ? <Toaster position="bottom-right" /> : null}
			<div className="overflow-hidden">
				<SidebarProvider defaultOpen className="relative h-svh">
					<AppSidebar
						agents={agents}
						workspaceBase={workspaceBase}
						workspaceName={workspaceName}
					/>
					<SidebarInset className="min-w-0 bg-sidebar shadow-none md:rounded-none md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:shadow-none">
						<div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-sidebar">
							{isChatRoute ? children : (
								<div className="flex min-h-0 flex-1 p-3">
									<section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
										<SiteHeader workspaceBase={workspaceBase} user={user} />
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

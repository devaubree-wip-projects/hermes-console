"use client"

import { useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon, MenuIcon, SearchIcon, XIcon } from "lucide-react"
import { Button } from "@/components/v1-xulux/ui/button"
import { Input } from "@/components/v1-xulux/ui/input"
import {
  SETTINGS_PANELS,
  SETTINGS_PANEL_BY_ID,
  isWideSettingsPanel,
  settingsPanelHref,
  type SettingsPanelId,
} from "@/components/settings/settings-routes"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

function SettingsLayout({
  active,
  children,
  onClose,
  workspaceBase,
}: {
  active: SettingsPanelId
  children: ReactNode
  onClose: () => void
  workspaceBase: string
}) {
  const [query, setQuery] = useState("")
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const activePanel = SETTINGS_PANEL_BY_ID[active]

  const sections = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr")
    const filtered = normalizedQuery
      ? SETTINGS_PANELS.filter((panel) => {
          const haystack = [panel.label, panel.section, ...panel.keywords]
            .join(" ")
            .toLocaleLowerCase("fr")
          return haystack.includes(normalizedQuery)
        })
      : SETTINGS_PANELS
    const grouped = new Map<string, (typeof SETTINGS_PANELS)[number][]>()
    for (const panel of filtered) {
      const items = grouped.get(panel.section) ?? []
      items.push(panel)
      grouped.set(panel.section, items)
    }
    return [...grouped.entries()]
  }, [query])

  const sidebar = (
    <aside
      className={cn(
        "h-full shrink-0 flex-col border-r border-border/60 bg-background",
        "fixed inset-0 z-20 w-full md:static md:flex md:w-[240px]",
        mobileNavOpen ? "flex" : "hidden",
      )}
    >
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeftIcon className="size-4" />
            Retour à l’application
          </button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="md:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Fermer la navigation des paramètres"
          >
            <XIcon />
          </Button>
        </div>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher dans les paramètres…"
            aria-label="Rechercher dans les paramètres"
            className="h-8 rounded-lg bg-muted/40 pl-9 text-sm"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Paramètres">
        {sections.length ? sections.map(([section, panels]) => (
          <div key={section} className="mb-4">
            <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {section}
            </div>
            <ul className="space-y-0.5">
              {panels.map((panel) => (
                <li key={panel.id}>
                  <Link
                    href={settingsPanelHref(workspaceBase, panel.id)}
                    replace
                    onClick={() => setMobileNavOpen(false)}
                    aria-current={active === panel.id ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      active === panel.id
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <panel.icon className="size-4" />
                    {panel.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )) : (
          <p className="px-3 py-6 text-sm text-muted-foreground">Aucun réglage trouvé.</p>
        )}
      </nav>
    </aside>
  )

  return (
    <div className="flex h-full min-h-0 w-full bg-background text-foreground">
      {sidebar}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border/60 bg-background/95 px-3 md:hidden">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Ouvrir la navigation des paramètres"
          >
            <MenuIcon />
          </Button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{activePanel.label}</span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Fermer les paramètres"
          >
            <XIcon />
          </Button>
        </div>
        <div
          className={cn(
            "mx-auto w-full px-5 py-8 md:px-10 md:py-12",
            isWideSettingsPanel(active) ? "max-w-5xl" : "max-w-3xl",
          )}
        >
          {children}
        </div>
      </main>
    </div>
  )
}

export function SettingsFrame({
  active,
  children,
  workspaceBase,
}: {
  active: SettingsPanelId
  children: ReactNode
  workspaceBase: string
}) {
  const router = useRouter()
  const close = () => router.push(`${workspaceBase}/dashboard`)

  return (
    <div className="h-full min-h-0 w-full bg-background">
      <SettingsLayout
        active={active}
        onClose={close}
        workspaceBase={workspaceBase}
      >
        {children}
      </SettingsLayout>
      <Toaster
        position="bottom-center"
        richColors
        duration={4000}
        toastOptions={{
          style: {
            borderRadius: "10px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            fontSize: "14px",
          },
          classNames: {
            success: "!bg-[#007AFF] !text-white !border-[#007AFF]",
          },
        }}
      />
    </div>
  )
}

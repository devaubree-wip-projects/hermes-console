"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { Command as CommandPrimitive } from "cmdk"
import { SearchIcon } from "lucide-react"
import {
  getSearchableProductNavigation,
  withAgentContext,
} from "@/components/product/product-navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/v1-xulux/ui/dialog"
import { cn } from "@/lib/utils"

export type SearchCommandItem = {
  id: string
  label: string
  keywords?: readonly string[]
  href?: string
  onSelect?: () => void
}

export type SearchCommandResult = SearchCommandItem & {
  category: string
}

export type SearchCommandProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  placeholder?: string
  emptyMessage?: string
  suggestions?: SearchCommandItem[]
  results?: SearchCommandResult[]
  className?: string
}

// No default demo entries in this app — the demo host routes don't exist here.
const defaultSuggestions: SearchCommandItem[] = []

const defaultResults: SearchCommandResult[] = []

function itemValue(item: SearchCommandItem, category?: string) {
  return [item.label, category, ...(item.keywords ?? [])].filter(Boolean).join(" ")
}

function SearchCommandKbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="pointer-events-none inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-muted px-1 font-sans text-[10px] font-medium text-foreground-muted shadow-xs select-none"
      data-slot="kbd"
    >
      {children}
    </kbd>
  )
}

function SearchCommandGroupSeparator() {
  return (
    <div
      className="mx-2 my-3 h-px w-auto shrink-0 bg-border"
      data-slot="separator"
      role="none"
    />
  )
}

function SearchCommandSectionHeading({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 py-1.5 text-xs font-medium text-foreground-soft">{children}</p>
  )
}

function SearchCommandItemButton({
  label,
  category,
  value,
  onSelect,
}: {
  label: string
  category?: string
  value: string
  onSelect: () => void
}) {
  return (
    <CommandPrimitive.Item
      className="flex w-full items-center justify-between rounded-lg border border-transparent px-2 py-2 text-sm text-foreground outline-none transition-[background-color] hover:bg-secondary-hover data-[selected=true]:bg-secondary-hover focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
      onSelect={onSelect}
      value={value}
    >
      <span className="truncate">{label}</span>
      {category ? (
        <span className="ml-3 shrink-0 text-xs text-foreground-muted">{category}</span>
      ) : null}
    </CommandPrimitive.Item>
  )
}

function SearchCommandFooter() {
  return (
    <div className="flex items-center justify-between px-4 py-2 text-xs text-foreground-muted">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <SearchCommandKbd>↑</SearchCommandKbd>
          <SearchCommandKbd>↓</SearchCommandKbd>
          naviguer
        </span>
        <span className="flex items-center gap-1">
          <SearchCommandKbd>↵</SearchCommandKbd>
          ouvrir
        </span>
      </div>
      <span className="flex items-center gap-1">
        <SearchCommandKbd>Échap</SearchCommandKbd>
        fermer
      </span>
    </div>
  )
}

export function SearchCommand({
  open,
  onOpenChange,
  placeholder = "Rechercher une page ou une action…",
  emptyMessage = "Aucun résultat trouvé.",
  suggestions = defaultSuggestions,
  results = defaultResults,
  className,
}: SearchCommandProps) {
  const router = useRouter()

  const runItem = useCallback(
    (item: SearchCommandItem) => {
      onOpenChange(false)
      item.onSelect?.()
      if (item.href) router.push(item.href)
    },
    [onOpenChange, router],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Recherche globale</DialogTitle>
        <DialogDescription>
          Rechercher une page ou une action dans Hermes Console
        </DialogDescription>
      </DialogHeader>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/20 backdrop-blur-md supports-backdrop-filter:backdrop-blur-md"
        className={cn(
          "max-h-[calc(100dvh-4rem)] gap-0 overflow-hidden rounded-xl border-border bg-muted p-1 shadow-lg ring-0 sm:max-w-xl",
          className,
        )}
      >
        <CommandPrimitive
          className="rounded-xl"
          data-command="true"
          label="Recherche globale"
          loop
        >
          <div className="flex h-12 items-center px-3">
            <SearchIcon className="size-4 shrink-0 text-foreground-soft" />
            <CommandPrimitive.Input
              className="flex w-full min-w-0 rounded-lg bg-transparent px-3 py-1 text-sm text-foreground outline-none placeholder:text-foreground-soft focus-visible:outline-none"
              placeholder={placeholder}
            />
          </div>

          <div className="rounded-lg bg-card shadow-sm">
            <CommandPrimitive.List className="max-h-96 overflow-y-auto p-1">
              <CommandPrimitive.Empty className="px-2 py-6 text-center text-sm text-foreground-muted">
                {emptyMessage}
              </CommandPrimitive.Empty>

              {suggestions.length > 0 ? (
                <div>
                  <SearchCommandGroupSeparator />
                  <SearchCommandSectionHeading>Suggestions</SearchCommandSectionHeading>
                  {suggestions.map((item) => (
                    <SearchCommandItemButton
                      key={item.id}
                      label={item.label}
                      onSelect={() => runItem(item)}
                      value={itemValue(item)}
                    />
                  ))}
                </div>
              ) : null}

              {results.length > 0 ? (
                <div>
                  <SearchCommandGroupSeparator />
                  <SearchCommandSectionHeading>Navigation</SearchCommandSectionHeading>
                  {results.map((item) => (
                    <SearchCommandItemButton
                      key={item.id}
                      category={item.category}
                      label={item.label}
                      onSelect={() => runItem(item)}
                      value={itemValue(item, item.category)}
                    />
                  ))}
                </div>
              ) : null}
            </CommandPrimitive.List>
          </div>

          <SearchCommandFooter />
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  )
}

type SearchCommandContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const SearchCommandContext = createContext<SearchCommandContextValue | null>(null)

export function SearchCommandProvider({
  activeAgentId,
  children,
  defaultAgentId,
  workspaceBase,
  suggestions,
  results,
  placeholder,
  emptyMessage,
}: {
  activeAgentId?: string
  children: ReactNode
  defaultAgentId?: string
  workspaceBase: string
  suggestions?: SearchCommandItem[]
  results?: SearchCommandResult[]
  placeholder?: string
  emptyMessage?: string
}) {
  const [open, setOpen] = useState(false)
  const navigationResults = useMemo<SearchCommandResult[]>(
    () => getSearchableProductNavigation(workspaceBase).map((route) => ({
      id: route.id,
      label: route.title,
      category: route.category,
      keywords: route.keywords,
      href: withAgentContext(route.href, activeAgentId, defaultAgentId),
    })),
    [activeAgentId, defaultAgentId, workspaceBase],
  )

  const toggle = useCallback(() => setOpen((current) => !current), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k") return
      if (!(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setOpen((current) => !current)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const value = useMemo(
    () => ({
      open,
      setOpen,
      toggle,
    }),
    [open, toggle],
  )

  return (
    <SearchCommandContext.Provider value={value}>
      {children}
      <SearchCommand
        emptyMessage={emptyMessage}
        onOpenChange={setOpen}
        open={open}
        placeholder={placeholder}
        results={results ?? navigationResults}
        suggestions={suggestions}
      />
    </SearchCommandContext.Provider>
  )
}

export function useSearchCommand() {
  const context = useContext(SearchCommandContext)
  if (!context) {
    throw new Error("useSearchCommand must be used within SearchCommandProvider")
  }
  return context
}

export function SearchCommandTrigger({
  className,
  placeholder = "Rechercher dans Hermes Console…",
}: {
  className?: string
  placeholder?: string
}) {
  const { setOpen } = useSearchCommand()

  return (
    <button
      aria-label={placeholder}
      className={cn(
        "flex h-8 w-full max-w-sm items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground-muted shadow-xs transition-colors hover:bg-muted/50",
        className,
      )}
      onClick={() => setOpen(true)}
      type="button"
    >
      <SearchIcon className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left text-[13px]">{placeholder}</span>
      <span className="hidden items-center gap-0.5 sm:flex">
        <SearchCommandKbd>Ctrl/⌘ K</SearchCommandKbd>
      </span>
    </button>
  )
}

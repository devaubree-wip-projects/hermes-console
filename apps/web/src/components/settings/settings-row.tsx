import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function SettingsPanelHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <header>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">{description}</p>
    </header>
  )
}

export function SettingsSection({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("space-y-0", className)}>
      <h2 className="mb-1 text-sm font-medium text-foreground">{title}</h2>
      <div className="divide-y divide-border/60">{children}</div>
    </section>
  )
}

export function SettingsRow({
  label,
  description,
  control,
  align = "start",
}: {
  label: ReactNode
  description?: ReactNode
  control: ReactNode
  align?: "start" | "center"
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 py-4 sm:flex-row sm:justify-between sm:gap-8",
        align === "center" ? "sm:items-center" : "sm:items-start",
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-sm text-foreground">{label}</div>
        {description ? (
          <div className="text-sm leading-relaxed text-muted-foreground">{description}</div>
        ) : null}
      </div>
      <div className="shrink-0 sm:pt-0.5">{control}</div>
    </div>
  )
}

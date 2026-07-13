"use client"

import * as React from "react"
import { BellIcon, CircleCheckIcon, CircleXIcon, InfoIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type AlertVariant = "default" | "info" | "success" | "warning" | "error" | "destructive"

/* tinted callout per semantic role (boardui color families) */
const VARIANT: Record<AlertVariant, { Icon: LucideIcon; wrap: string; icon: string }> = {
  default: { Icon: BellIcon, wrap: "border-neutral-200 bg-white", icon: "text-neutral-500" },
  info: { Icon: InfoIcon, wrap: "border-[#bedbff] bg-[#eff6ff]", icon: "text-[#1447e6]" },
  success: { Icon: CircleCheckIcon, wrap: "border-[#d9f99d] bg-[#f7fee7]", icon: "text-[#3c6300]" },
  warning: { Icon: TriangleAlertIcon, wrap: "border-[#fff085] bg-[#fefce8]", icon: "text-[#894b00]" },
  error: { Icon: CircleXIcon, wrap: "border-[#ffccd3] bg-[#fff1f2]", icon: "text-[#a50036]" },
  // shadcn-compat alias so existing `variant="destructive"` call sites keep working
  destructive: { Icon: CircleXIcon, wrap: "border-[#ffccd3] bg-[#fff1f2]", icon: "text-[#a50036]" },
}

export function Alert({
  variant = "default",
  title,
  icon,
  meta,
  children,
  className,
}: {
  variant?: AlertVariant
  title?: React.ReactNode
  icon?: LucideIcon
  meta?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  const v = VARIANT[variant]
  const Icon = icon ?? v.Icon
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-xl border p-3", v.wrap, className)}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", v.icon)} />
      <div className="min-w-0 flex-1">
        {(title || meta) && (
          <div className="flex items-center justify-between gap-2">
            {title && <p className="truncate text-sm font-medium text-neutral-950">{title}</p>}
            {meta && <span className="shrink-0 text-xs text-neutral-400">{meta}</span>}
          </div>
        )}
        {children && <div className="mt-0.5 text-[13px] leading-snug text-neutral-600">{children}</div>}
      </div>
    </div>
  )
}

/* shadcn-compat sub-components: existing call sites compose `<Alert><AlertTitle/>
   <AlertDescription/></Alert>`; keep them working on top of the boardui Alert. */
export function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("text-sm font-medium text-neutral-950", className)} {...props} />
}

export function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("text-[13px] leading-snug text-neutral-600", className)} {...props} />
}

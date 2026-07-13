"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

type TriggerArgs = {
  ref: (el: HTMLElement | null) => void
  onClick: () => void
  "aria-expanded": boolean
}

type PopoverProps = {
  trigger: (args: TriggerArgs) => React.ReactNode
  children: React.ReactNode | ((close: () => void) => React.ReactNode)
  align?: "start" | "end"
  width?: number
  className?: string
}

/* anchored dropdown panel (portal, fixed) — opens below the trigger, closes on outside click / Escape */
export function Popover({ trigger, children, align = "end", width = 288, className }: PopoverProps) {
  const [open, setOpen] = React.useState(false)
  const [shown, setShown] = React.useState(false)
  const [pos, setPos] = React.useState<{ top: number; left?: number; right?: number }>({ top: 0 })
  const anchorRef = React.useRef<HTMLElement | null>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const setAnchor = React.useCallback((el: HTMLElement | null) => {
    anchorRef.current = el
  }, [])

  const close = React.useCallback(() => {
    setShown(false)
    window.setTimeout(() => setOpen(false), 150)
  }, [])

  const place = React.useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const top = r.bottom + 8
    // clientWidth excludes the scrollbar; innerWidth includes it (would shift a right-anchored panel off by the scrollbar width)
    const vw = document.documentElement.clientWidth
    if (align === "end") setPos({ top, right: Math.max(8, vw - r.right) })
    else setPos({ top, left: Math.max(8, Math.min(r.left, vw - width - 8)) })
  }, [align, width])

  const toggle = () => {
    if (open) {
      close()
      return
    }
    place()
    setOpen(true)
    requestAnimationFrame(() => setShown(true))
  }

  React.useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    window.addEventListener("resize", place)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", place)
    }
  }, [open, close, place])

  return (
    <>
      {/* eslint-disable-next-line react-hooks/refs -- setAnchor is a stable callback ref, no .current read during render */}
      {trigger({ ref: setAnchor, onClick: toggle, "aria-expanded": open })}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            style={{ position: "fixed", top: pos.top, left: pos.left, right: pos.right, width, maxWidth: "calc(100vw - 16px)" }}
            className={cn(
              "z-[110] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[var(--shadow-elevated)] transition duration-150 ease-out",
              align === "end" ? "origin-top-right" : "origin-top-left",
              shown ? "scale-100 opacity-100 blur-0" : "scale-95 opacity-0 blur-[2px]",
              className
            )}
          >
            {typeof children === "function" ? children(close) : children}
          </div>,
          document.body
        )}
    </>
  )
}

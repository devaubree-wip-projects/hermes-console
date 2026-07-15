"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      richColors
      {...props}
    />
  )
}

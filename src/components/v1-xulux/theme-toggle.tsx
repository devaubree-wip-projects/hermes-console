"use client"

import { useTheme } from "next-themes"
import { MoonIcon, SunIcon } from "lucide-react"
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/v1-xulux/ui/sidebar"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="text-muted-foreground"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        size="sm"
        tooltip="Toggle theme"
      >
        <SunIcon className="scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
        <MoonIcon className="absolute scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
        <span>{resolvedTheme === "dark" ? "Dark mode" : "Light mode"}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

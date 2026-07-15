"use client";

import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";

/**
 * Landing-nav theme toggle. Icon visibility is driven purely by the `.dark` class
 * (CSS), which next-themes sets before first paint — so there's no hydration
 * mismatch and no mounted-state effect needed.
 */
export function LandingThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label="Changer de thème"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="relative inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#84cc16]"
    >
      <SunIcon className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
      <MoonIcon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
    </button>
  );
}

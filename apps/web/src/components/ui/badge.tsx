import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "border-red-700/25 bg-red-100 text-red-800 focus-visible:ring-red-700/20 dark:border-red-300/30 dark:bg-red-950/50 dark:text-red-300 dark:focus-visible:ring-red-300/30 [a]:hover:bg-red-200 dark:[a]:hover:bg-red-950/70",
        success:
          "border-emerald-700/25 bg-emerald-100 text-emerald-800 focus-visible:ring-emerald-700/20 dark:border-emerald-300/30 dark:bg-emerald-950/50 dark:text-emerald-300 dark:focus-visible:ring-emerald-300/30 [a]:hover:bg-emerald-200 dark:[a]:hover:bg-emerald-950/70",
        warning:
          "border-amber-700/30 bg-amber-100 text-amber-900 focus-visible:ring-amber-700/20 dark:border-amber-300/30 dark:bg-amber-950/50 dark:text-amber-300 dark:focus-visible:ring-amber-300/30 [a]:hover:bg-amber-200 dark:[a]:hover:bg-amber-950/70",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }

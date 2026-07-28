"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const markerVariants = cva(
  "aui-marker-root flex w-full items-center gap-2 text-sm text-muted-foreground",
  {
    variants: {
      variant: {
        default: "py-1",
        border: "border-b border-border/60 py-2",
        separator:
          "relative justify-center py-4 before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-border/70 after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-border/70",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Marker({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof markerVariants>) {
  return (
    <div
      data-slot="marker"
      data-variant={variant ?? "default"}
      className={cn(markerVariants({ variant }), className)}
      {...props}
    />
  );
}

function MarkerIcon({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="marker-icon"
      aria-hidden
      className={cn(
        "aui-marker-icon inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function MarkerContent({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="marker-content"
      className={cn("aui-marker-content min-w-0", className)}
      {...props}
    />
  );
}

function MarkerSeparatorContent({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="marker-content"
      className={cn(
        "aui-marker-content relative z-10 bg-background px-3 text-xs font-medium capitalize",
        className,
      )}
      {...props}
    />
  );
}

export { Marker, MarkerContent, MarkerIcon, MarkerSeparatorContent, markerVariants };

"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion, type Variants } from "motion/react";

/**
 * Scroll-triggered reveal that NEVER strands content.
 *
 * - Server + no-JS: rendered fully visible — content is always readable.
 * - Client: elements already on screen at mount stay visible (no flash, no disappear);
 *   elements below the fold are hidden imperceptibly (off-screen) then fade in on scroll.
 * - Reduced motion: always visible, no animation.
 *
 * Styling is applied imperatively via the ref (no React state) so there is no
 * re-render and no "visible-then-vanish" hydration race — the bug that framer-motion's
 * `whileInView` caused on the last cards.
 */
export function Reveal({
  children,
  delay = 0,
  y = 16,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return; // reduced motion → stay visible (default)

    const rect = el.getBoundingClientRect();
    const inView = rect.top < window.innerHeight - 40 && rect.bottom > 0;
    if (inView) return; // already on screen — keep visible, never hide

    // Below/above the fold: hide instantly (unseen), then fade in once scrolled into view.
    el.style.opacity = "0";
    el.style.transform = `translateY(${y}px)`;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.transition = `opacity 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}s`;
          el.style.opacity = "1";
          el.style.transform = "none";
          io.disconnect();
        }
      },
      { rootMargin: "-80px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce, y, delay]);

  const Comp = Tag as "div";
  return (
    <Comp ref={ref} className={className}>
      {children}
    </Comp>
  );
}

/** Stagger container for the on-load hero sequence (above the fold, animates on mount). */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.1 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

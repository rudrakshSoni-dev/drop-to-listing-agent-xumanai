"use client";

import { useSyncExternalStore } from "react";

export const BREAKPOINTS = { md: 768, lg: 1024, xl: 1280 } as const;

export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export type EditorLayout = "mobile" | "md" | "lg" | "xl";

/** Editor layout tier per DESIGN.md §9. */
export function useEditorLayout(): EditorLayout {
  const md = useMediaQuery(`(min-width: ${BREAKPOINTS.md}px)`);
  const lg = useMediaQuery(`(min-width: ${BREAKPOINTS.lg}px)`);
  const xl = useMediaQuery(`(min-width: ${BREAKPOINTS.xl}px)`, true);
  if (xl) return "xl";
  if (lg) return "lg";
  if (md) return "md";
  return "mobile";
}

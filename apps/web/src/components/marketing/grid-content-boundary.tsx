"use client";

import { createContext, type ReactNode } from "react";

export const GridContentContext = createContext(false);

/** Nested data reads inherit the frame that is already on screen. */
export function GridContentBoundary({ children }: { children: ReactNode }) {
  return <GridContentContext.Provider value={true}>{children}</GridContentContext.Provider>;
}

"use client";

// Linear-style: dark-only theme. This context exists for potential future use.
// No toggle needed — the app is permanently dark.

import { createContext, useContext, ReactNode } from "react";

const ThemeContext = createContext({ theme: "dark" as const });

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={{ theme: "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

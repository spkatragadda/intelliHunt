"use client";

import { ReactNode } from "react";
import { SidebarProvider, useSidebar } from "./SidebarContext";
import { ThemeProvider } from "./ThemeContext";
import Sidebar from "./Sidebar";
import Header from "./Header";

function ShellInner({ children }: { children: ReactNode }) {
  const { open } = useSidebar();

  return (
    <div className="relative z-10 flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-8 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <ShellInner>{children}</ShellInner>
      </SidebarProvider>
    </ThemeProvider>
  );
}

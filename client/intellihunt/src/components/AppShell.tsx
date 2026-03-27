"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SidebarProvider, useSidebar } from "./SidebarContext";
import { ThemeProvider } from "./ThemeContext";
import Sidebar from "./Sidebar";
import Header from "./Header";

// Routes that render without the sidebar/header shell
const SHELL_BYPASS = ["/", "/login", "/register", "/admin", "/about", "/forgot-password", "/reset-password"];

function ShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = SHELL_BYPASS.some(p => pathname === p || pathname.startsWith(p + "/"));

  if (isAuthPage) {
    return <>{children}</>;
  }

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

"use client";

import { createContext, useContext, useState, HTMLAttributes, ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

/* ── Context ── */
type TabsCtx = { value: string; onValueChange: (v: string) => void };
const TabsContext = createContext<TabsCtx | null>(null);
function useTabsCtx() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs compound component must be used within <Tabs>");
  return ctx;
}

/* ── Tabs root ── */
interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  ({ value: controlledValue, defaultValue = "", onValueChange, className, children, ...props }, ref) => {
    const [internal, setInternal] = useState(defaultValue);
    const isControlled = controlledValue !== undefined;
    const current = isControlled ? controlledValue : internal;

    const handleChange = (v: string) => {
      if (!isControlled) setInternal(v);
      onValueChange?.(v);
    };

    return (
      <TabsContext.Provider value={{ value: current, onValueChange: handleChange }}>
        <div ref={ref} className={cn("w-full", className)} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  }
);
Tabs.displayName = "Tabs";

/* ── TabsList ── */
const TabsList = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex", className)}
      style={{ borderBottom: "1px solid var(--border)", gap: "4px", padding: "0 2px", ...props.style }}
      role="tablist"
      {...props}
    />
  )
);
TabsList.displayName = "TabsList";

/* ── TabsTrigger ── */
interface TabsTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, children, ...props }, ref) => {
    const { value: current, onValueChange } = useTabsCtx();
    const active = current === value;

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => onValueChange(value)}
        className={cn(
          "px-6 py-3.5 text-[13.5px] font-semibold transition-all duration-150 relative",
          className
        )}
        style={{
          color: active ? "var(--accent)" : "var(--text-muted)",
          background: active ? "var(--accent-subtle)" : "transparent",
          borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
          borderRadius: "4px 4px 0 0",
          marginBottom: "-1px",
          letterSpacing: "0.005em",
          cursor: "pointer",
          outline: "none",
          fontFamily: "var(--font-display)",
          boxShadow: active ? "0 0 14px rgba(74,158,255,0.12)" : "none",
          transition: "color 150ms ease, background 150ms ease, box-shadow 150ms ease",
          ...props.style,
        }}
        onMouseEnter={e => {
          if (!active) {
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.background = "var(--surface-hover)";
          }
        }}
        onMouseLeave={e => {
          if (!active) {
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.background = "transparent";
          }
        }}
        {...props}
      >
        {children}
      </button>
    );
  }
);
TabsTrigger.displayName = "TabsTrigger";

/* ── TabsContent ── */
interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  forceMount?: boolean;
}

const TabsContent = forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, forceMount, children, ...props }, ref) => {
    const { value: current } = useTabsCtx();
    const active = current === value;

    if (!active && !forceMount) return null;

    return (
      <div
        ref={ref}
        role="tabpanel"
        className={cn("w-full", className)}
        style={{ display: active ? "block" : "none", ...props.style }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };

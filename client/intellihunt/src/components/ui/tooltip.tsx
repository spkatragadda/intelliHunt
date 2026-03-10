"use client";

import { createContext, useContext, useState, ReactNode, HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

/* Simple CSS-based tooltip — no Radix dependency */
type TooltipCtx = { open: boolean; setOpen: (v: boolean) => void };
const TooltipContext = createContext<TooltipCtx>({ open: false, setOpen: () => {} });

function TooltipProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function Tooltip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <span className="relative inline-flex">{children}</span>
    </TooltipContext.Provider>
  );
}

function TooltipTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) {
  const { setOpen } = useContext(TooltipContext);
  return (
    <span
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      className="inline-flex"
    >
      {children}
    </span>
  );
}

interface TooltipContentProps extends HTMLAttributes<HTMLDivElement> {
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
}

const TooltipContent = forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ className, side = "top", children, ...props }, ref) => {
    const { open } = useContext(TooltipContext);
    if (!open) return null;

    const posStyle: React.CSSProperties = {
      top:    side === "bottom" ? "calc(100% + 6px)" : undefined,
      bottom: side === "top"    ? "calc(100% + 6px)" : undefined,
      left:   side === "right"  ? "calc(100% + 6px)" : side === "top" || side === "bottom" ? "50%" : undefined,
      right:  side === "left"   ? "calc(100% + 6px)" : undefined,
      transform: side === "top" || side === "bottom" ? "translateX(-50%)" : undefined,
    };

    return (
      <div
        ref={ref}
        className={cn(
          "absolute z-50 px-3 py-1.5 text-[12px] font-medium rounded-md pointer-events-none whitespace-nowrap",
          className
        )}
        style={{
          background: "var(--surface-raised)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          ...posStyle,
          ...props.style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
TooltipContent.displayName = "TooltipContent";

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent };

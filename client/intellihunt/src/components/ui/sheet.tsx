"use client";

import { createContext, useContext, useState, ReactNode, HTMLAttributes, ButtonHTMLAttributes, forwardRef, useEffect } from "react";
import { cn } from "@/lib/utils";

/* ── Context ── */
type SheetCtx = { open: boolean; setOpen: (v: boolean) => void };
const SheetContext = createContext<SheetCtx | null>(null);
function useSheet() {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error("Sheet compound component must be used within <Sheet>");
  return ctx;
}

/* ── Sheet root ── */
interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

function Sheet({ open: controlled, onOpenChange, children }: SheetProps) {
  const [internal, setInternal] = useState(false);
  const isControlled = controlled !== undefined;
  const open = isControlled ? controlled : internal;

  const setOpen = (v: boolean) => {
    if (!isControlled) setInternal(v);
    onOpenChange?.(v);
  };

  return (
    <SheetContext.Provider value={{ open, setOpen }}>
      {children}
    </SheetContext.Provider>
  );
}

/* ── SheetTrigger ── */
interface SheetTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}
function SheetTrigger({ children, asChild, ...props }: SheetTriggerProps) {
  const { setOpen } = useSheet();
  return (
    <button type="button" onClick={() => setOpen(true)} {...props}>
      {children}
    </button>
  );
}

/* ── SheetClose ── */
function SheetClose({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useSheet();
  return (
    <button type="button" onClick={() => setOpen(false)} {...props}>
      {children}
    </button>
  );
}

/* ── SheetContent ── */
type SheetSide = "left" | "right" | "top" | "bottom";

interface SheetContentProps extends HTMLAttributes<HTMLDivElement> {
  side?: SheetSide;
}

const sheetSideStyles: Record<SheetSide, React.CSSProperties> = {
  right:  { top: 0, right: 0, bottom: 0, width: "min(420px, 90vw)", transform: "translateX(100%)" },
  left:   { top: 0, left: 0, bottom: 0, width: "min(420px, 90vw)", transform: "translateX(-100%)" },
  top:    { top: 0, left: 0, right: 0, height: "min(50vh, 400px)", transform: "translateY(-100%)" },
  bottom: { bottom: 0, left: 0, right: 0, height: "min(50vh, 400px)", transform: "translateY(100%)" },
};

const SheetContent = forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, side = "right", children, ...props }, ref) => {
    const { open, setOpen } = useSheet();

    useEffect(() => {
      const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
      if (open) document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }, [open, setOpen]);

    if (!open) return null;

    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-50"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
          onClick={() => setOpen(false)}
        />
        {/* Panel */}
        <div
          ref={ref}
          className={cn("fixed z-50 flex flex-col overflow-hidden", className)}
          style={{
            ...sheetSideStyles[side],
            transform: "none",
            background: "var(--surface)",
            borderLeft: side === "right" ? "1px solid var(--border)" : undefined,
            borderRight: side === "left" ? "1px solid var(--border)" : undefined,
            borderBottom: side === "top" ? "1px solid var(--border)" : undefined,
            borderTop: side === "bottom" ? "1px solid var(--border)" : undefined,
            boxShadow: "-4px 0 32px rgba(0,0,0,0.5)",
            ...props.style,
          }}
          {...props}
        >
          {children}
        </div>
      </>
    );
  }
);
SheetContent.displayName = "SheetContent";

const SheetHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col gap-2 px-6 py-5 flex-shrink-0", className)}
      style={{ borderBottom: "1px solid var(--border)", ...props.style }}
      {...props}
    />
  )
);
SheetHeader.displayName = "SheetHeader";

const SheetTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn("text-[16px] font-semibold tracking-tight", className)}
      style={{ color: "var(--text-primary)", ...props.style }}
      {...props}
    />
  )
);
SheetTitle.displayName = "SheetTitle";

const SheetDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-[13px]", className)}
      style={{ color: "var(--text-muted)", ...props.style }}
      {...props}
    />
  )
);
SheetDescription.displayName = "SheetDescription";

const SheetFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center justify-end gap-3 px-6 py-4 flex-shrink-0", className)}
      style={{ borderTop: "1px solid var(--border)", ...props.style }}
      {...props}
    />
  )
);
SheetFooter.displayName = "SheetFooter";

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription };

"use client";

import { SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

/* Native-based Select that matches the design system */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, style, ...props }, ref) => (
    <div className="relative w-full">
      <select
        ref={ref}
        className={cn("input-base appearance-none pr-8 cursor-pointer", className)}
        style={style}
        {...props}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5"
        style={{ color: "var(--text-muted)" }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
        </svg>
      </div>
    </div>
  )
);
Select.displayName = "Select";

/* shadcn-compatible named exports for drop-in compatibility */
const SelectTrigger = Select;
const SelectContent = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const SelectItem = ({ value, children }: { value: string; children: React.ReactNode }) => (
  <option value={value}>{children}</option>
);
const SelectValue = ({ placeholder }: { placeholder?: string }) => (
  <option value="" disabled>{placeholder}</option>
);

export { Select, SelectTrigger, SelectContent, SelectItem, SelectValue };

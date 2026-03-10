import { LabelHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {}

const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "block text-[11px] uppercase tracking-widest font-medium cursor-default",
        className
      )}
      style={{ color: "var(--text-muted)", ...props.style }}
      {...props}
    />
  )
);
Label.displayName = "Label";

export { Label };

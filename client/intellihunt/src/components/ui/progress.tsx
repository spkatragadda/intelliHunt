import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
}

const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, ...props }, ref) => {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className={cn("w-full h-[5px] rounded-full overflow-hidden", className)}
        style={{ background: "var(--surface-raised)", ...props.style }}
        {...props}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, var(--accent), var(--accent-hover))",
            boxShadow: "0 0 8px rgba(74,158,255,0.40)",
          }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

export { Progress };

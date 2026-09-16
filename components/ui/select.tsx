import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A plain native `<select>` styled to match `Input` (ADR 018) — no Radix
 * select primitive is installed in this repo yet, and a native element is
 * enough for the provider-type/model dropdowns this feature needs.
 */
const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-surface-02 px-3 py-1 text-sm text-frost shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    );
  },
);
Select.displayName = "Select";

export { Select };

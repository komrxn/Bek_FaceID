import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Native <select> styled to match Input. Native (rather than a shadcn
 * popover Select) because the kiosk server has no design budget for a
 * portal-based listbox and native selects are fully accessible + work on
 * the Android tablet's touch keyboard out of the box.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        "flex h-11 w-full appearance-none rounded-xl border border-bek-border bg-bek-surface pl-3.5 pr-10 py-2 " +
          "text-body-md text-bek-text " +
          "transition-colors hover:border-bek-borderStrong " +
          "focus-visible:outline-none focus-visible:border-bek-indigo focus-visible:ring-2 focus-visible:ring-bek-indigo/30 " +
          "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-bek-textFaint pointer-events-none"
      strokeWidth={1.75}
    />
  </div>
));
Select.displayName = "Select";

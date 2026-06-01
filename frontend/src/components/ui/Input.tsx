import * as React from "react";
import { cn } from "@/lib/cn";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-xl border border-bek-border bg-bek-surface px-3.5 py-2 " +
        "text-body-md text-bek-text placeholder:text-bek-textFaint " +
        "transition-colors hover:border-bek-borderStrong " +
        "focus-visible:outline-none focus-visible:border-bek-indigo focus-visible:ring-2 focus-visible:ring-bek-indigo/30 " +
        "disabled:opacity-50 disabled:cursor-not-allowed " +
        "file:bg-transparent file:border-0 file:text-body-sm file:font-medium",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

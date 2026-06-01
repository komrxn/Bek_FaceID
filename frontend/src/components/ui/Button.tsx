import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all " +
    "focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 " +
    "select-none active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-bek-indigo text-white hover:bg-bek-indigo/90 shadow-sm",
        secondary:
          "bg-bek-surface text-bek-text border border-bek-border hover:bg-bek-surface2 shadow-xs",
        ghost: "hover:bg-bek-surface2 text-bek-text",
        danger:
          "bg-bek-red text-white hover:bg-bek-red/90 shadow-sm",
        success:
          "bg-bek-green text-white hover:bg-bek-green/90 shadow-sm",
        outline:
          "border border-bek-border bg-transparent hover:bg-bek-surface2 text-bek-text",
      },
      size: {
        sm:  "h-9 px-3 text-body-sm rounded-lg",
        md:  "h-11 px-4 text-body-md rounded-xl",
        lg:  "h-12 px-5 text-body-lg rounded-xl",
        // 88-pt kiosk CTA — used in M4
        kiosk: "h-[88px] px-10 text-display-sm rounded-4xl shadow-xl",
        icon: "h-10 w-10 rounded-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        aria-busy={loading || undefined}
        disabled={props.disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

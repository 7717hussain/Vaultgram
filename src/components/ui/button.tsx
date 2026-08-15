import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.99]";

    const variants = {
      default:
        "bg-zinc-100 text-zinc-950 hover:bg-white shadow-[0_1px_2px_rgba(0,0,0,0.5)] border border-zinc-200/20",
      destructive:
        "bg-destructive/80 text-destructive-foreground shadow-sm hover:bg-destructive border border-destructive/30",
      outline:
        "border border-zinc-800 bg-zinc-950/60 text-zinc-200 hover:bg-zinc-900 hover:border-zinc-700 hover:text-zinc-100",
      secondary:
        "bg-zinc-900 text-zinc-200 border border-zinc-800/80 hover:bg-zinc-800 hover:text-zinc-100",
      ghost:
        "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50",
      link: "text-zinc-300 underline-offset-4 hover:underline",
    };

    const sizes = {
      default: "h-9 px-3.5 py-2",
      sm: "h-8 rounded-sm px-2.5 text-xs",
      lg: "h-10 rounded-md px-6",
      icon: "h-8 w-8 rounded-sm",
    };

    return (
      <button
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };

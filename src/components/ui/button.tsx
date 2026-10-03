import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-violet-700 text-white shadow-[0_8px_24px_rgba(91,63,200,.22)] hover:bg-violet-800",
        secondary:
          "border border-violet-200 bg-white text-violet-800 hover:bg-violet-50",
        ghost: "text-neutral-700 hover:bg-neutral-100",
        dark: "bg-neutral-950 text-white hover:bg-neutral-800",
      },
      size: { default: "h-12", icon: "size-11 p-0" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };
export function Button({ className, variant, size, asChild, ...props }: Props) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

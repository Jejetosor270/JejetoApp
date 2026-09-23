import { cva } from "class-variance-authority";

/** Presentation only: parsers, validation and controlled input behavior stay with callers. */
export const controlVariants = cva(
  "border-input bg-card text-foreground placeholder:text-muted-foreground min-w-0 rounded-md border outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      density: {
        standard: "h-9 w-full px-3 text-sm",
        compact: "h-8 px-2 text-xs",
      },
    },
    defaultVariants: { density: "standard" },
  },
);

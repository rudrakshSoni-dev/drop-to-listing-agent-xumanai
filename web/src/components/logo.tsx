import { cn } from "@/lib/utils";

/** Gradient mark: a play triangle turning into a card. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-brand-gradient text-primary-foreground inline-flex size-7 items-center justify-center rounded-lg",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M5 5.5v7l5.5-3.5z" fill="currentColor" stroke="none" />
        <rect x="11" y="9" width="9" height="11" rx="2" />
        <path d="M13.5 16.5h4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

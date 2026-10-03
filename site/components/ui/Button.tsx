import type { ReactNode } from "react";

type Variant = "primary" | "secondary";
type Size = "md" | "sm";

interface ButtonProps {
  readonly href: string;
  readonly children: ReactNode;
  readonly variant?: Variant;
  readonly size?: Size;
}

const base =
  "group inline-flex shrink-0 select-none items-center justify-center gap-2.5 border whitespace-nowrap font-semibold " +
  "transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] " +
  "[font-variation-settings:'wdth'_92]";

const variants: Record<Variant, string> = {
  primary: "border-ink bg-ink text-sheet hover:bg-[#d8d5ce] hover:border-[#d8d5ce]",
  secondary: "border-rule-strong text-ink hover:border-ink-faint hover:bg-sheet-raised",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-[0.9375rem]",
  sm: "h-9 px-4 text-[0.875rem]",
};

/** A link styled as a button. External links open in the same tab and say where they go. */
export function Button({ href, children, variant = "primary", size = "md" }: ButtonProps) {
  const external = /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      className={`${base} ${variants[variant]} ${sizes[size]}`}
      {...(external ? { rel: "noopener" } : {})}
    >
      {children}
      {external && <ExternalMark />}
    </a>
  );
}

/** A small arrow for links that leave the page, drawn on the same stroke as the drawings. */
function ExternalMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className="size-3 transition-transform duration-150 ease-out group-hover:-translate-y-px group-hover:translate-x-px"
    >
      <path d="M3.5 2.5h6v6M9.5 2.5 2.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

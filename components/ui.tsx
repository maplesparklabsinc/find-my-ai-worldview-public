// Small shared building blocks that follow design/README.md.
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { CheckIcon } from "./icons";

const base =
  "inline-flex min-h-14 w-full items-center justify-center rounded-md px-6 type-option font-semibold no-underline transition-colors";
const variants = {
  primary: "bg-accent text-on-accent",
  secondary: "border border-line-strong bg-surface-raised text-ink",
};

export function LinkButton({
  href,
  children,
  variant = "primary",
  className = "",
  onClick,
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof variants;
  className?: string;
  /** Only from a client component. */
  onClick?: () => void;
}) {
  return (
    <Link href={href} onClick={onClick} className={`${base} ${variants[variant]} ${className}`} style={{ color: undefined }}>
      {children}
    </Link>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  const disabled = rest.disabled ? "border border-line bg-surface text-ink-muted" : variants[variant];
  return <button type="button" className={`${base} ${disabled} ${className}`} {...rest} />;
}

/**
 * One answer row. Selection shows fill, a 2px outline, a check mark and bold
 * together, so it never depends on colour alone.
 */
export function OptionButton({
  selected,
  onClick,
  children,
  tall = false,
  centred = false,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Trade-off cards and longer options: more padding, top-aligned check. */
  tall?: boolean;
  /** Short labels side by side (Slightly / Strongly): centre the label. */
  centred?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={[
        "flex w-full gap-3 rounded-md text-left type-option text-ink",
        centred ? "justify-center" : "justify-between",
        tall ? "min-h-14 items-start" : "min-h-tap-option items-center",
        selected
          ? `border-2 border-accent bg-accent-soft font-bold ${tall ? "px-[15px] py-[15px]" : "px-[13px] py-[7px]"}`
          : `border border-line-strong bg-surface-raised ${tall ? "p-4" : "px-[14px] py-2"}`,
      ].join(" ")}
    >
      <span className="min-w-0 wrap-break-word">{children}</span>
      {selected && <CheckIcon className={`flex-none text-accent ${tall ? "mt-1" : ""}`} />}
    </button>
  );
}

/**
 * A result track: a neutral line between two labelled ends, a centre tick, and
 * markers. Positions are for drawing only; the text equivalent is `label`.
 * In comparisons each marker carries a name: yours above the line, your
 * friend's below, so the difference never depends on colour.
 */
export function Track({
  label,
  low,
  high,
  markers,
}: {
  label: string;
  low: string;
  high: string;
  markers: { position: number; kind: "you" | "friend"; name?: string }[];
}) {
  const named = markers.some((m) => m.name);
  const at = (p: number) => `calc(9px + (100% - 18px) * ${p.toFixed(4)})`;
  // Keep labels inside the track near the ends.
  const shift = (p: number) => (p < 0.12 ? "-9px" : p > 0.88 ? "calc(-100% + 9px)" : "-50%");
  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={label} className={`relative ${named ? "h-18" : "h-6"}`}>
        <div className={`absolute inset-x-0 h-0.5 rounded-pill bg-line ${named ? "top-[35px]" : "top-[11px]"}`} />
        <div className={`absolute left-1/2 -ml-px h-3.5 w-0.5 rounded-pill bg-line ${named ? "top-[29px]" : "top-[5px]"}`} />
        {markers.map((m, i) => (
          <div key={i}>
            <div
              className={`absolute -ml-[9px] size-[18px] rounded-pill ${named ? "top-[27px]" : "top-[3px]"} ${
                m.kind === "you" ? "bg-accent" : "border-2 border-second bg-surface-raised"
              }`}
              // Keep the whole marker inside the track at both ends.
              style={{ left: at(m.position) }}
            />
            {m.name && (
              <span
                aria-hidden="true"
                className={`absolute whitespace-nowrap type-small text-ink-muted ${m.kind === "you" ? "top-0" : "bottom-0"}`}
                style={{ left: at(m.position), transform: `translateX(${shift(m.position)})` }}
              >
                {m.name}
              </span>
            )}
          </div>
        ))}
      </div>
      {/* With large text on a narrow screen the end labels may not fit side by side: the high end then wraps below, still on the right. */}
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 type-small text-ink-muted [overflow-wrap:anywhere]">
        <span>{low}</span>
        <span className="ml-auto text-right">{high}</span>
      </div>
    </div>
  );
}

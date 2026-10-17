"use client";
// The interactive parts of the admin world map (issue #84): the tooltip on hover
// and keyboard focus, and the "Show the numbers" toggle, open by default on phones.
// The map itself is drawn on the server and passed in as children.
import { useEffect, useRef, useState, type ReactNode } from "react";

interface Tip {
  title: string;
  lines: string[];
  x: number;
  y: number;
}

/** Shows a tooltip for any `[data-area]` element inside, from its data-tip-* attributes. Escape hides it. */
export function MapTooltips({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const show = (target: EventTarget) => {
    const el = (target as Element).closest?.("[data-area]");
    if (!el || !box.current) return;
    const area = el.getBoundingClientRect();
    const outer = box.current.getBoundingClientRect();
    setTip({
      title: el.getAttribute("data-area") ?? "",
      lines: [el.getAttribute("data-tip-all") ?? "", el.getAttribute("data-tip-week") ?? ""],
      x: area.left + area.width / 2 - outer.left,
      y: area.top - outer.top,
    });
  };

  return (
    <div
      ref={box}
      className="relative"
      onMouseOver={(e) => show(e.target)}
      onMouseLeave={() => setTip(null)}
      onFocus={(e) => show(e.target)}
      onBlur={() => setTip(null)}
      onKeyDown={(e) => e.key === "Escape" && setTip(null)}
    >
      {children}
      {tip && (
        // The same words are each area's aria-label, so screen readers don't need this.
        <div
          aria-hidden="true"
          data-map-tooltip=""
          className="pointer-events-none absolute z-10 w-max max-w-[14rem] -translate-x-1/2 -translate-y-[calc(100%+0.5rem)] rounded-sm bg-ink px-3.5 py-2.5 text-base leading-[1.375rem] text-surface"
          style={{ left: `clamp(7rem, ${tip.x}px, calc(100% - 7rem))`, top: Math.max(tip.y, 0) }}
        >
          <div className="font-bold">{tip.title}</div>
          {tip.lines.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Show the numbers": closed on wider screens, open on phones, where the map is small. */
export function NumbersToggle({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current && window.matchMedia("(max-width: 639px)").matches) ref.current.open = true;
  }, []);
  return (
    <details ref={ref} className="group">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-accent underline">{label}</summary>
      {children}
    </details>
  );
}

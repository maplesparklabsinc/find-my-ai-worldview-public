"use client";

// The landing page's two measured moments (issue #24): which start button was
// used, and whether the perspective cards were seen. No IDs, no answers.
import { useEffect, useRef } from "react";
import { LinkButton } from "@/components/ui";
import { track } from "@/lib/analytics";

export function StartButton({ position, label, className }: { position: "hero" | "perspectives"; label: string; className?: string }) {
  return (
    <LinkButton href="/start" className={className} onClick={() => track("landing_start_selected", { position })}>
      {label}
    </LinkButton>
  );
}

/** Sends one event the first time a fifth of its contents is on screen (the cards are taller than a phone screen). */
export function SeenOnce({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          track("landing_perspectives_viewed");
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

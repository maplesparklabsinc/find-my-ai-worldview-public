// Funnel events (docs/01-product-spec.md section 6.4). No personal data, no IDs:
// only the event name and, where listed, one small label.
import { track as vercelTrack } from "@vercel/analytics";

type Events = {
  /** The landing page's perspective cards scrolled into view (issue #24). */
  landing_perspectives_viewed: undefined;
  /** A landing start button: above or below the perspective cards. */
  landing_start_selected: { position: "hero" | "perspectives" };
  quiz_started: undefined;
  section_completed: { section: number };
  /** The guess before the result (issue #24). The kind only, never which perspectives. */
  prediction_shown: undefined;
  prediction_submitted: { kind: "perspective" | "between" | "own_combination" | "forming" | "not_priority" };
  prediction_skipped: undefined;
  quiz_completed: undefined;
  /** The person's own result is shown for the first time, saved or not. */
  result_revealed: undefined;
  result_shared: { channel: string };
  /** A "Go deeper" row on a result page opened for the first time in this page view (issue #28). */
  result_section_opened: { section: "stands_out" | "talk" | "elsewhere" | "about_p1" | "about_p2" | "common_ground" | "others" | "help" | "why" };
  compare_link_created: undefined;
  compare_started: undefined;
  compare_completed: undefined;
  research_email_left: undefined;
  feedback_sent: undefined;
};

export function track<K extends keyof Events>(name: K, ...props: Events[K] extends undefined ? [] : [Events[K]]): void {
  try {
    vercelTrack(name, props[0]);
  } catch {
    // Analytics must never break the page.
  }
}

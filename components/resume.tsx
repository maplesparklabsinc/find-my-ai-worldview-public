"use client";

// Getting back into a quiz in progress in this tab (issue #37): the start
// buttons on / and /start, and the link at the top of the reading pages. Both
// read sessionStorage, which the server can't see.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Button, LinkButton } from "@/components/ui";
import { getCopy } from "@/lib/content/copy";
import { clearQuiz, loadQuiz } from "@/lib/quiz";

const noop = () => () => {};

/** A quiz in this tab that has got somewhere: an answer, or past the first question. Opening /quiz alone doesn't count. */
function useInProgress(): boolean {
  return useSyncExternalStore(
    noop,
    () => {
      const q = loadQuiz();
      return q !== null && (q.index > 0 || Object.keys(q.answers).length > 0);
    },
    () => false,
  );
}

/** False on the server and while the page hydrates, true once this tab's storage can be read. */
function useKnown(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

/**
 * The start button (`children`), or, with a quiz in progress in this tab,
 * "You have a quiz in progress" with "Pick up where you left off" (/quiz goes
 * back to the screen they were on) and "Start over" in its place. Never both:
 * the start button would only pick the quiz up again. The start button is
 * kept invisible until the tab is read, so it can't flash and then swap.
 */
export function StartOrResume({ children }: { children: React.ReactNode }) {
  const r = getCopy().resume;
  const router = useRouter();
  const known = useKnown();
  const inProgress = useInProgress();
  if (!known) return <div className="invisible">{children}</div>;
  if (!inProgress) return children;
  return (
    <div className="flex flex-col gap-3">
      <p className="font-semibold">{r.in_progress}</p>
      <LinkButton href="/quiz">{r.continue}</LinkButton>
      <Button
        variant="secondary"
        onClick={() => {
          clearQuiz();
          router.push("/quiz");
        }}
      >
        {r.start_over}
      </Button>
    </div>
  );
}

/** At the top of Privacy, How this works and What's changed: back to the quiz in progress, or to the start. Same tab. */
export function BackLink() {
  const n = getCopy().nav;
  const inProgress = useInProgress();
  return (
    <Link href={inProgress ? "/quiz" : "/"} className="flex min-h-tap-min items-center type-small">
      {inProgress ? n.back_to_quiz : n.back_to_start}
    </Link>
  );
}

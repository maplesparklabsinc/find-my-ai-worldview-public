"use client";

import dynamic from "next/dynamic";

// Client only: the walkthrough keeps progress in sessionStorage.
const DevQuiz = dynamic(() => import("./dev-quiz"), { ssr: false, loading: () => <p>Loading…</p> });

export default function DevLoader() {
  return <DevQuiz />;
}

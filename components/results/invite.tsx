"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { track } from "@/lib/analytics";
import { clearQuiz, saveCompareWith } from "@/lib/quiz";

/** Start a fresh quiz that will be compared with response `id` when it is saved. */
export function AcceptInvite({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <Button
      onClick={() => {
        clearQuiz();
        saveCompareWith(id);
        track("compare_started");
        router.push("/start");
      }}
    >
      {label}
    </Button>
  );
}

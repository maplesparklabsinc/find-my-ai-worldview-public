import type { Metadata } from "next";
import { FeedbackForm } from "@/components/feedback";
import { ResultShell } from "@/components/results/shell";
import { getCopy } from "@/lib/content/copy";

export const metadata: Metadata = { title: "Tell us" };

export default function Feedback() {
  return (
    <ResultShell>
      <main className="flex flex-col gap-6">
        <h1 className="type-title">{getCopy().feedback.heading}</h1>
        <FeedbackForm />
      </main>
    </ResultShell>
  );
}

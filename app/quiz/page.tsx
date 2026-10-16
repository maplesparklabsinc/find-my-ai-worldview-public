import type { Metadata } from "next";
import { QuizClient } from "@/components/client-only";

export const metadata: Metadata = { title: "Questions" };

export default function QuizPage() {
  return <QuizClient />;
}

import type { Metadata } from "next";
import { ResultClient } from "@/components/client-only";

export const metadata: Metadata = { title: "Your result", robots: { index: false } };

export default function ResultPage() {
  return <ResultClient />;
}

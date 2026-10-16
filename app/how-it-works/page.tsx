import type { Metadata } from "next";
import { ReadingPage } from "@/components/page-shell";
import { getPage } from "@/lib/content/pages";

export const metadata: Metadata = { title: "How this works" };

export default function HowItWorks() {
  return <ReadingPage source={getPage("how-it-works")} />;
}

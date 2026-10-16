import type { Metadata } from "next";
import { ReadingPage } from "@/components/page-shell";
import { getPage } from "@/lib/content/pages";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return <ReadingPage source={getPage("privacy")} />;
}

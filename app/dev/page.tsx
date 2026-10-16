// Unstyled test harness for M1: walk through the whole quiz and see the raw
// result. Not a real screen. Hidden in production unless ENABLE_DEV_PAGE=1.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DevLoader from "./dev-loader";

export const metadata: Metadata = {
  title: "Dev: quiz walkthrough",
  robots: { index: false, follow: false },
};

export default function DevPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_PAGE !== "1") notFound();
  return <DevLoader />;
}

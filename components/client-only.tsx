"use client";

// The quiz and the result read sessionStorage, so they render in the browser only.
import dynamic from "next/dynamic";

export const QuizClient = dynamic(() => import("./quiz/quiz"), { ssr: false });
export const ResultClient = dynamic(() => import("./results/result"), { ssr: false });

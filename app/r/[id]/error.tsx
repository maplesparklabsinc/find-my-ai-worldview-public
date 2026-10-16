"use client";

import { ResultShell } from "@/components/results/shell";
import { Button } from "@/components/ui";
import { getCopy } from "@/lib/content/copy";

export default function ResultError({ retry }: { retry: () => void }) {
  const p = getCopy().result_page;
  return (
    <ResultShell>
      <main role="alert" className="flex flex-col gap-6">
        <h1 className="type-title">{p.error_heading}</h1>
        <p>{p.error_body}</p>
        <Button onClick={() => retry()}>{p.retry}</Button>
      </main>
    </ResultShell>
  );
}

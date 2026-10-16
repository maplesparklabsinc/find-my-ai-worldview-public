// POST /api/responses: store a completed quiz (docs/01-product-spec.md section 6.2).
// The result is recomputed here; the browser's own result is never trusted.
import { NextResponse } from "next/server";
import { error, overLimit, readJson, tooMany } from "@/lib/api";
import { getContent } from "@/lib/content";
import { PG, insertResponse, pgCode } from "@/lib/db";
import { hashEditToken, newEditToken } from "@/lib/edit-token";
import { checkResponse, newResponseId } from "@/lib/submit";

export async function POST(req: Request) {
  const wait = overLimit(req, "responses", 20);
  if (wait !== null) return tooMany(wait);
  const body = await readJson(req);
  if (!body.ok) return body.response;

  const checked = checkResponse(getContent(), body.value);
  if (!checked.ok) return error(400, checked.error, checked.reason);

  // The edit token is returned once, here; only its hash is stored.
  const token = newEditToken();
  // A collision on an 83-bit random ID is vanishingly unlikely; retry once anyway.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // The same quiz sent again (same submission key) gets back its first ID.
      const id = await insertResponse(newResponseId(), checked.value, hashEditToken(token));
      return NextResponse.json({ id, token, result: checked.value.result }, { status: 201, headers: { "cache-control": "no-store" } });
    } catch (e) {
      const code = pgCode(e);
      if (code === PG.foreignKeyViolation) return error(400, "unknown compare link");
      if (code !== PG.uniqueViolation) throw e;
    }
  }
  return error(500, "could not save");
}

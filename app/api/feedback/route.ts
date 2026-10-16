// POST /api/feedback: the "Tell us" form.
import { NextResponse } from "next/server";
import { error, tooMany, overLimit, readJson } from "@/lib/api";
import { getContent } from "@/lib/content";
import { PG, getAnyEditTokenHash, insertFeedback, pgCode } from "@/lib/db";
import { EDIT_TOKEN_HEADER, editTokenMatches } from "@/lib/edit-token";
import { checkFeedback } from "@/lib/submit";

export async function POST(req: Request) {
  const wait = overLimit(req, "feedback", 10);
  if (wait !== null) return tooMany(wait);
  const body = await readJson(req);
  if (!body.ok) return body.response;

  const checked = checkFeedback(getContent(), body.value);
  if (!checked.ok) return error(400, checked.error);
  // Anyone with a result link can attach it, so the admin page labels an
  // attachment that didn't come with the result's edit token as unverified.
  const id = checked.value.response_id;
  const verified = id !== null && editTokenMatches(req.headers.get(EDIT_TOKEN_HEADER), await getAnyEditTokenHash(id));
  try {
    await insertFeedback(checked.value, verified);
  } catch (e) {
    if (pgCode(e) === PG.foreignKeyViolation) return error(400, "unknown result");
    throw e;
  }
  return new NextResponse(null, { status: 204 });
}

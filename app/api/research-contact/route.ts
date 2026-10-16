// POST /api/research-contact: an email for research follow-ups, with consent.
// The email is never returned, logged or shown anywhere. Needs the result's
// edit token, like every other change to a result.
import { NextResponse } from "next/server";
import { error, tooMany, hasEditToken, overLimit, readJson } from "@/lib/api";
import { PG, insertResearchContact, pgCode } from "@/lib/db";
import { checkResearchContact } from "@/lib/submit";

export async function POST(req: Request) {
  const wait = overLimit(req, "research-contact", 5);
  if (wait !== null) return tooMany(wait);
  const body = await readJson(req);
  if (!body.ok) return body.response;

  const checked = checkResearchContact(body.value);
  if (!checked.ok) return error(400, checked.error);
  // Only from the browser that saved the result, while it can still be changed.
  if (!(await hasEditToken(req, checked.value.response_id))) return error(404, "not found");
  try {
    await insertResearchContact(checked.value);
  } catch (e) {
    if (pgCode(e) === PG.foreignKeyViolation) return error(400, "unknown result");
    throw e;
  }
  return new NextResponse(null, { status: 204 });
}

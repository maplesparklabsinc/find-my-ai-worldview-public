// PATCH /api/responses/{id}: result feedback (fit rating, better fit and track
// checks), allowed on the day of completion and the day after, and only with the edit token returned when the result was saved.
import { NextResponse } from "next/server";
import { error, tooMany, hasEditToken, overLimit, readJson } from "@/lib/api";
import { getContent } from "@/lib/content";
import { patchResponse } from "@/lib/db";
import { checkPatch, responseIdSchema } from "@/lib/submit";

export async function PATCH(req: Request, ctx: RouteContext<"/api/responses/[id]">) {
  const wait = overLimit(req, "responses-patch", 30);
  if (wait !== null) return tooMany(wait);
  const { id } = await ctx.params;
  if (!responseIdSchema.safeParse(id).success) return error(404, "not found");
  // Only the browser that saved the result can change it; anything else is "not found".
  if (!(await hasEditToken(req, id))) return error(404, "not found");
  const body = await readJson(req);
  if (!body.ok) return body.response;

  const checked = checkPatch(getContent(), body.value);
  if (!checked.ok) return error(400, checked.error);
  if (!(await patchResponse(id, checked.value))) return error(404, "not found or too late to change");
  return new NextResponse(null, { status: 204 });
}

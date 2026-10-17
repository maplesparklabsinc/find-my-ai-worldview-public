// GET /admin/export (issue #55, section 1): the anonymous data as one zip,
// built on request and never stored. Behind the admin password (proxy.ts), and
// checked again here. ?release=<key> for one content release (default all),
// ?from= and ?to= (YYYY-MM-DD, inclusive) for a date range. No email addresses:
// see lib/admin/export.
import { connection } from "next/server";
import { buildExport, parseDate, zipExport } from "@/lib/admin/export";
import { adminPassword } from "@/lib/admin/gate";
import { releaseVersions } from "@/lib/admin/responses";
import { contentVersions, getContent } from "@/lib/content";
import { releaseKey, releaseKeys } from "@/lib/content/release";
import { readExport } from "@/lib/db/admin";

export async function GET(request: Request) {
  await connection();
  if (!adminPassword()) return new Response("Not found", { status: 404 });
  const params = new URL(request.url).searchParams;
  const content = getContent();
  const keys = [...(await releaseKeys()), releaseKey(contentVersions(content))];
  const key = params.get("release") ?? "";
  const versions = releaseVersions(key, keys);
  const from = parseDate(params.get("from"));
  const to = parseDate(params.get("to"));

  const { responses, feedback } = await readExport(versions, from, to);
  const date = new Date().toISOString().slice(0, 10);
  const files = buildExport(content, responses, feedback, { date, release: versions ? key : "all", from, to });
  return new Response(Buffer.from(zipExport(files)), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="fmaw-export-${date}.zip"`,
      "cache-control": "no-store",
    },
  });
}

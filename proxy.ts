// Two password gates, both HTTP Basic auth (any user name). Nothing about the
// request is logged or stored.
//
// - /admin (issue #14) needs ADMIN_PASSWORD, whether or not the site gate is on,
//   in its own realm, so a browser doesn't offer the site password there. It is
//   a 404 when ADMIN_PASSWORD is not set, or is the same as SITE_PASSWORD
//   (issue #37; instrumentation.ts logs a warning at startup).
// - M2 preview gate (docs/01-product-spec.md 9): when SITE_PASSWORD is set,
//   every other request needs that password. Unset it to open the site.
import { NextResponse, type NextRequest } from "next/server";
import { adminPassword } from "@/lib/admin/gate";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const password = adminPassword();
    if (!password) return new NextResponse("Not found", { status: 404 });
    if (!(await authorised(request, password))) return challenge("admin");
    const res = NextResponse.next();
    res.headers.set("cache-control", "no-store");
    res.headers.set("x-robots-tag", "noindex, nofollow");
    return res;
  }

  const password = process.env.SITE_PASSWORD;
  if (!password || (await authorised(request, password))) return NextResponse.next();
  return challenge("Find My AI Worldview (preview)");
}

async function authorised(request: NextRequest, password: string): Promise<boolean> {
  const [scheme, encoded] = (request.headers.get("authorization") ?? "").split(" ");
  if (scheme !== "Basic" || !encoded) return false;
  let decoded: string;
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
  } catch {
    return false;
  }
  return sameSecret(decoded.slice(decoded.indexOf(":") + 1), password);
}

/** Constant-time comparison: both sides are hashed first, so length leaks nothing either. */
export async function sameSecret(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function challenge(realm: string): NextResponse {
  return new NextResponse("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"` },
  });
}

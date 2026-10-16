import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isAdmin, scrub } from "@/components/analytics";
import { register } from "@/instrumentation";
import { SAME_PASSWORD_WARNING, adminPassword, adminWarning } from "@/lib/admin/gate";
import { proxy, sameSecret } from "@/proxy";

const saved = { site: process.env.SITE_PASSWORD, admin: process.env.ADMIN_PASSWORD };
afterEach(() => {
  setEnv("SITE_PASSWORD", saved.site);
  setEnv("ADMIN_PASSWORD", saved.admin);
});

function setEnv(k: string, v: string | undefined) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

function req(path: string, password?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (password !== undefined) headers.authorization = `Basic ${Buffer.from(`anyone:${password}`).toString("base64")}`;
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe("/admin gate", () => {
  it("is a 404 when ADMIN_PASSWORD is not set", async () => {
    setEnv("ADMIN_PASSWORD", undefined);
    expect((await proxy(req("/admin"))).status).toBe(404);
    expect((await proxy(req("/admin", "anything"))).status).toBe(404);
  });

  it("needs ADMIN_PASSWORD, with any user name", async () => {
    setEnv("ADMIN_PASSWORD", "s3cret pässword");
    setEnv("SITE_PASSWORD", undefined);
    expect((await proxy(req("/admin"))).status).toBe(401);
    expect((await proxy(req("/admin", "wrong"))).status).toBe(401);
    expect((await proxy(req("/admin", "s3cret pässword:"))).status).toBe(401);
    const ok = await proxy(req("/admin", "s3cret pässword"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(ok.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect((await proxy(req("/admin/anything"))).status).toBe(401);
  });

  it("the site password doesn't open /admin, and the admin password doesn't open the site", async () => {
    setEnv("ADMIN_PASSWORD", "admin");
    setEnv("SITE_PASSWORD", "site");
    expect((await proxy(req("/admin", "site"))).status).toBe(401);
    expect((await proxy(req("/admin", "admin"))).status).toBe(200);
    expect((await proxy(req("/", "admin"))).status).toBe(401);
    expect((await proxy(req("/", "site"))).status).toBe(200);
  });

  it("asks in its own realm, not the site's", async () => {
    setEnv("ADMIN_PASSWORD", "admin");
    setEnv("SITE_PASSWORD", "site");
    expect((await proxy(req("/admin"))).headers.get("www-authenticate")).toBe('Basic realm="admin", charset="UTF-8"');
    expect((await proxy(req("/"))).headers.get("www-authenticate")).not.toContain('realm="admin"');
  });

  // A browser that saved the site password sends it to /admin as well (issue #37).
  it("is a 404 when ADMIN_PASSWORD is the same as SITE_PASSWORD", async () => {
    setEnv("ADMIN_PASSWORD", "same");
    setEnv("SITE_PASSWORD", "same");
    expect((await proxy(req("/admin", "same"))).status).toBe(404);
    expect((await proxy(req("/admin/responses", "same"))).status).toBe(404);
    expect((await proxy(req("/admin"))).status).toBe(404);
    // The site itself still works with its password.
    expect((await proxy(req("/", "same"))).status).toBe(200);
    expect(adminPassword()).toBeNull();
  });

  it("warns once at startup when the passwords are the same, without either password", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      setEnv("ADMIN_PASSWORD", "hunter2-same");
      setEnv("SITE_PASSWORD", "hunter2-same");
      register();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(SAME_PASSWORD_WARNING);
      expect(JSON.stringify(warn.mock.calls)).not.toContain("hunter2");

      warn.mockClear();
      setEnv("SITE_PASSWORD", "different");
      register();
      setEnv("SITE_PASSWORD", undefined);
      register();
      expect(warn).not.toHaveBeenCalled();
      expect(adminWarning({ ADMIN_PASSWORD: undefined, SITE_PASSWORD: undefined })).toBeNull();
      expect(adminPassword({ ADMIN_PASSWORD: "a", SITE_PASSWORD: "b" })).toBe("a");
    } finally {
      warn.mockRestore();
    }
  });

  it("leaves other paths alone when no site password is set", async () => {
    setEnv("ADMIN_PASSWORD", "admin");
    setEnv("SITE_PASSWORD", undefined);
    expect((await proxy(req("/administrator"))).status).toBe(200);
    expect((await proxy(req("/"))).status).toBe(200);
  });

  it("ignores malformed headers", async () => {
    setEnv("ADMIN_PASSWORD", "admin");
    const r = new NextRequest("http://localhost/admin", { headers: { authorization: "Basic %%%" } });
    expect((await proxy(r)).status).toBe(401);
  });
});

describe("sameSecret", () => {
  it("compares exactly", async () => {
    expect(await sameSecret("abc", "abc")).toBe(true);
    expect(await sameSecret("abc", "abd")).toBe(false);
    expect(await sameSecret("", "abc")).toBe(false);
  });
});

describe("analytics", () => {
  it("sends nothing from /admin", () => {
    expect(isAdmin("https://x.test/admin")).toBe(true);
    expect(isAdmin("https://x.test/admin?x=1")).toBe(true);
    expect(isAdmin("https://x.test/administrator")).toBe(false);
    expect(scrub("https://x.test/r/abcdefghijklmn?vs=1")).toBe("https://x.test/r/[id]");
  });
});

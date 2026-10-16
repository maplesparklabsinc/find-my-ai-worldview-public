// Whether /admin is open, and with which password (issue #37). Pure, and safe
// in proxy.ts. Nothing here logs or returns either password.

export const SAME_PASSWORD_WARNING = "ADMIN_PASSWORD must differ from SITE_PASSWORD";

type Env = Record<string, string | undefined>;

/**
 * The admin password, or null when /admin is off: unset, or the same as
 * SITE_PASSWORD. A browser that saved the site password would otherwise send
 * it to /admin too and be let straight in.
 */
export function adminPassword(env: Env = process.env): string | null {
  const admin = env.ADMIN_PASSWORD;
  if (!admin) return null;
  return admin === env.SITE_PASSWORD ? null : admin;
}

/** The warning to log once at startup, or null when the passwords are fine. */
export function adminWarning(env: Env = process.env): string | null {
  return env.ADMIN_PASSWORD && env.ADMIN_PASSWORD === env.SITE_PASSWORD ? SAME_PASSWORD_WARNING : null;
}

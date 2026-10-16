// Runs once when the server starts (Next.js instrumentation).
import { adminWarning } from "@/lib/admin/gate";

export function register() {
  // /admin stays closed (404) while the two passwords are the same; say why, once, without either password.
  const warning = adminWarning();
  if (warning) console.warn(warning);
}

// Edit tokens: proof that a request comes from the browser that saved a result.
// Result links are shared publicly, so knowing the result ID is not enough to
// change it. Only the SHA-256 hash is stored; comparison is constant-time.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export { EDIT_TOKEN_HEADER } from "./header";

/** A new random token: 32 bytes, base64url (43 characters). */
export function newEditToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashEditToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

/** True only when a token was given and its hash equals the stored hash. */
export function editTokenMatches(token: string | null | undefined, storedHash: Uint8Array | null | undefined): boolean {
  if (!token || !storedHash || storedHash.length !== 32 || token.length > 256) return false;
  return timingSafeEqual(hashEditToken(token), storedHash);
}

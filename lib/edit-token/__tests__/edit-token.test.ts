import { describe, expect, it } from "vitest";
import { editTokenMatches, hashEditToken, newEditToken } from "@/lib/edit-token";

describe("edit tokens", () => {
  it("are random, 43 base64url characters, and only their own hash matches", () => {
    const a = newEditToken();
    const b = newEditToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(editTokenMatches(a, hashEditToken(a))).toBe(true);
    expect(editTokenMatches(b, hashEditToken(a))).toBe(false);
  });

  it("never match without a token or a stored hash", () => {
    const h = hashEditToken(newEditToken());
    expect(editTokenMatches(null, h)).toBe(false);
    expect(editTokenMatches("", h)).toBe(false);
    expect(editTokenMatches(undefined, h)).toBe(false);
    expect(editTokenMatches(newEditToken(), null)).toBe(false);
    expect(editTokenMatches("x", new Uint8Array(4))).toBe(false);
  });
});

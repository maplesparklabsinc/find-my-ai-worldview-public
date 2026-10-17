// Issue #51: email addresses in free text and feedback are masked before an admin page sees them.
import { describe, expect, it } from "vitest";
import { maskEmails } from "@/lib/admin/mask";

describe("maskEmails", () => {
  it("masks a plain address", () => {
    expect(maskEmails("someone@example.com")).toBe("[email removed]");
  });

  it("masks an address inside a sentence", () => {
    expect(maskEmails("Email me at jo.smith+ai@mail.example.org if you want.")).toBe("Email me at [email removed] if you want.");
  });

  it("masks two addresses", () => {
    expect(maskEmails("a@b.test and c_d@e.example")).toBe("[email removed] and [email removed]");
  });

  it("leaves an address spelled out in words as typed (a known limit)", () => {
    expect(maskEmails("name at gmail dot com")).toBe("name at gmail dot com");
  });

  it("leaves text with no address alone, line breaks included", () => {
    const text = "The third question was confusing.\nI wasn't sure what 'rules' meant. @ me if needed.";
    expect(maskEmails(text)).toBe(text);
  });
});

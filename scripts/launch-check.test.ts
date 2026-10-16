// npm run launch-check (issue #18): fails while anything the site needs before
// launch is still unset. Not part of `npm test`, so CI stays green during
// development; the CI launch job runs it on the release branch and on v* tags.
import { describe, expect, it } from "vitest";
import { missingPlaceholders } from "@/lib/content/copy";

describe("ready for launch", () => {
  it("every placeholder in content/copy.json has a value", () => {
    expect(missingPlaceholders(), "set these under placeholders in content/copy.json").toEqual([]);
  });
});

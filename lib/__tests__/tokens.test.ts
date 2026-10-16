// app/theme.css is generated from design/tokens.json; it must never drift.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildTokensCss, OUT_PATH, TOKENS_PATH } from "../../scripts/build-tokens.mjs";

it("app/theme.css matches design/tokens.json (run `npm run tokens`)", () => {
  const expected = buildTokensCss(JSON.parse(readFileSync(TOKENS_PATH, "utf8")));
  expect(readFileSync(OUT_PATH, "utf8")).toBe(expected);
});

it("has no colour outside the design system", () => {
  const css = readFileSync(OUT_PATH, "utf8");
  expect(css).toContain("--color-*: initial;");
});

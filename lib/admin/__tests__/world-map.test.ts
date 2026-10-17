// The admin map's path data (lib/admin/world-map.json, from scripts/build-world-map.mjs).
import { describe, expect, it } from "vitest";
import worldMap from "@/lib/admin/world-map.json";
import { MAP_AREAS } from "@/lib/admin/insights";
import { getContent } from "@/lib/content";

describe("world map paths", () => {
  it("has one area per D11 answer except Somewhere else, in order", () => {
    const options = getContent().itemsById.get("D11")!.options;
    expect([...MAP_AREAS]).toEqual(options.filter((o) => o !== "Somewhere else"));
    expect(Object.keys(worldMap.areas)).toEqual([...MAP_AREAS]);
  });

  it("gives every area a non-empty path, and leaves no land outside the areas (issue #87)", () => {
    for (const [name, d] of Object.entries(worldMap.areas)) expect(d, name).toMatch(/^M[\d.,LMZ-]+Z$/);
    expect(worldMap).not.toHaveProperty("land");
  });
});

#!/usr/bin/env node
// Builds lib/admin/world-map.json: SVG path strings for the admin "Where people
// live" map (issues #84 and #87), one per answer to "Where do you currently live?"
// that's drawn on the map. Run it after changing the regions below, and
// commit the output, so the app ships no map libraries:
//
//   node scripts/build-world-map.mjs
//
// Country outlines: Natural Earth 1:110m via the world-atlas package (public
// domain). Countries by ISO 3166-1 numeric code, as world-atlas uses them.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature, merge } from "topojson-client";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "lib", "admin", "world-map.json");
const WIDTH = 760;
const HEIGHT = 340;

const codes = (s) => s.split(/\s+/).filter(Boolean);
/**
 * Each mapped D11 answer and the countries drawn with it. Every piece of land has one (issue #87):
 * Russia and Greenland are drawn with Elsewhere in Europe, Central Asia with South Asia, the
 * Falklands with Latin America and New Caledonia with Australia or New Zealand, though
 * someone living there may have picked "Somewhere else". Counts are never moved between areas.
 */
export const REGIONS = {
  Canada: codes("124"),
  "United States": codes("840"),
  "Latin America": codes(
    "484 320 084 222 340 558 188 591 192 332 214 388 780 044 630 170 862 328 740 254 218 604 068 600 152 032 858 076 238",
  ),
  "United Kingdom": codes("826"),
  "Elsewhere in Europe": codes(
    "372 352 578 752 246 208 528 056 442 250 724 620 380 756 040 276 616 203 703 348 705 191 070 688 499 807 008 300 100 642 498 804 112 440 428 233 196 383 643 304",
  ),
  "Middle East": codes("792 760 422 376 275 400 368 682 414 048 634 784 512 887 364 051 268 031"),
  Africa: codes(
    "012 818 434 504 788 732 478 466 562 148 729 728 232 262 706 231 404 800 834 646 108 180 178 266 120 566 204 768 288 384 430 694 324 624 686 270 854 894 716 508 454 024 516 072 710 426 748 450 140 226",
  ),
  "South Asia": codes("356 586 050 524 064 144 004 398 860 795 417 762"),
  "East and Southeast Asia": codes("156 392 410 408 496 158 704 418 116 764 104 458 360 608 626 096"),
  "Australia or New Zealand": codes("036 554 598 090 548 242 540"),
};
// Not drawn: Antarctica and the French Southern and Antarctic Lands.
const NOT_DRAWN = new Set(["010", "260"]);
// Outlines Natural Earth gives no code, joined to the region around them.
const UNCODED = { Kosovo: "Elsewhere in Europe", "N. Cyprus": "Elsewhere in Europe", Somaliland: "Africa" };
const regionOf = (g) => (g.id ? Object.keys(REGIONS).find((r) => REGIONS[r].includes(g.id)) : UNCODED[g.properties.name]);

const require = createRequire(import.meta.url);
const topology = JSON.parse(readFileSync(require.resolve("world-atlas/countries-110m.json"), "utf8"));
const geometries = topology.objects.countries.geometries.filter((g) => !NOT_DRAWN.has(g.id));

// Natural Earth projection centred on 10°E, so the Pacific is cut near the date line
// rather than through Alaska; the Aleutian sliver that lands at the left edge is
// clipped in the SVG (x < 26).
const projection = geoNaturalEarth1()
  .rotate([-10, 0])
  .fitSize([WIDTH, HEIGHT], feature(topology, { type: "GeometryCollection", geometries }));
const path = geoPath(projection).digits(1);

const areas = Object.fromEntries(
  Object.entries(REGIONS).map(([label, ids]) => {
    const parts = geometries.filter((g) => regionOf(g) === label);
    const missing = ids.filter((id) => !parts.some((g) => g.id === id));
    // At 1:110m some places are part of another country's outline (French Guiana is in France's).
    if (missing.length) console.log(`${label}: no separate outline for ${missing.join(", ")}`);
    return [label, path(merge(topology, parts))];
  }),
);
const rest = geometries.filter((g) => !regionOf(g));
if (rest.length) throw new Error(`Land with no area: ${rest.map((g) => `${g.properties.name} (${g.id ?? "no code"})`).join(", ")}`);

writeFileSync(OUT, JSON.stringify({ width: WIDTH, height: HEIGHT, clipX: 26, areas }, null, 2) + "\n");
console.log(`${Object.keys(areas).length} areas -> ${OUT} (${(JSON.stringify(areas).length / 1024).toFixed(0)} KB)`);

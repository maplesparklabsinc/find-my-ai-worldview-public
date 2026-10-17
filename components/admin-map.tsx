// "Where people live" on the admin Overview as a world map (issue #84): each
// answer to "Where do you currently live?" is one area, shaded by count in five
// steps and always carrying its number. Server component; the paths come from
// lib/admin/world-map.json (scripts/build-world-map.mjs), so no map library ships.
import worldMapPaths from "@/lib/admin/world-map.json";
import type { MapAreaName, WorldMapView } from "@/lib/admin/insights";
import { MapTooltips } from "./admin-map-client";

const paths = worldMapPaths as { width: number; height: number; clipX: number; land: string; areas: Record<MapAreaName, string> };

/** Where each area's number sits: set by hand, since Alaska and Scandinavia pull centroids off. */
const LABEL_AT: Record<MapAreaName, [number, number]> = {
  Canada: [188, 62],
  "United States": [163, 110],
  "Latin America": [215, 228],
  "United Kingdom": [352, 66],
  "Elsewhere in Europe": [394, 86],
  "Middle East": [454, 126],
  Africa: [395, 186],
  "South Asia": [519, 136],
  "East and Southeast Asia": [578, 124],
  "Australia or New Zealand": [646, 266],
};

// Whole class names, so Tailwind finds them: the area's shade, and its number in the matching text colour.
const SHADE = ["", "fill-map-1", "fill-map-2", "fill-map-3", "fill-map-4", "fill-map-5"];
const NUMBER = [
  "",
  "fill-on-map-1 stroke-map-1",
  "fill-on-map-2 stroke-map-2",
  "fill-on-map-3 stroke-map-3",
  "fill-on-map-4 stroke-map-4",
  "fill-on-map-5 stroke-map-5",
];
const SWATCH = ["bg-map-1", "bg-map-2", "bg-map-3", "bg-map-4", "bg-map-5"];
const fmt = new Intl.NumberFormat("en-CA");

export function WorldMap({ view }: { view: WorldMapView }) {
  return (
    <div className="flex flex-col gap-3">
      <MapTooltips>
        <svg viewBox={`0 0 ${paths.width} ${paths.height}`} role="group" aria-label={view.summary} className="block h-auto w-full">
          <defs>
            <clipPath id="world-map-clip">
              <rect x={paths.clipX} y={0} width={paths.width - paths.clipX} height={paths.height} />
            </clipPath>
          </defs>
          <g clipPath="url(#world-map-clip)">
            <path d={paths.land} className="fill-map-none stroke-surface-raised" strokeWidth={0.7} aria-hidden="true" />
            {view.areas.map((a) => {
              const [x, y] = LABEL_AT[a.name];
              return (
                <g
                  key={a.name}
                  tabIndex={0}
                  role="img"
                  aria-label={a.description}
                  data-area={a.name}
                  data-tip-all={`All time: ${fmt.format(a.allTime)} · ${a.allPct}`}
                  data-tip-week={`Last 7 days: ${fmt.format(a.week)} · ${a.weekPct}`}
                  className="group cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <path
                    d={paths.areas[a.name]}
                    className={`${SHADE[a.step]} stroke-surface-raised group-hover:stroke-accent group-focus-visible:stroke-accent`}
                    strokeWidth={0.9}
                  />
                  <text
                    x={x}
                    y={y}
                    className={`${NUMBER[a.step]} text-[20px] font-bold`}
                    strokeWidth={4}
                    paintOrder="stroke"
                    strokeLinejoin="round"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    aria-hidden="true"
                  >
                    {fmt.format(a.allTime)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </MapTooltips>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-ink-muted">
        <p>
          Somewhere else: {fmt.format(view.somewhereElse)} · Not answered: {fmt.format(view.notAnswered)}
        </p>
        <p className="flex flex-wrap items-center gap-1.5">
          <span>fewer</span>
          {SWATCH.map((s) => (
            <span key={s} aria-hidden="true" className={`inline-block size-3.5 rounded-[3px] ${s}`} />
          ))}
          <span>more</span>
          <span aria-hidden="true" className="ml-2.5 inline-block size-3.5 rounded-[3px] bg-map-none" />
          <span>not an option</span>
        </p>
      </div>
    </div>
  );
}

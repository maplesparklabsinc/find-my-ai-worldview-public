// The share image (docs/01-product-spec.md 5.7, issue #28 and the ShareCardV2
// boards): the result's name, line and summary, the six positions drawn like
// the result page's tracks, and the product name. Nothing else about the
// person. Rendered by next/og at 1200×630 (link previews) and 1080×1080
// (download). Plain inline styles: next/og supports a subset of CSS and no
// class names.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import tokens from "@/design/tokens.json";
import { fill, getCopy } from "@/lib/content/copy";
import type { ResultView } from "@/lib/results";

const color = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value.light])) as Record<string, string>;

export const OG_SIZE = { width: 1200, height: 630 };
/** The position dot's diameter on the card's tracks, in px, as on the result page. */
const DOT = 18;
export const SQUARE_SIZE = { width: 1080, height: 1080 };

async function fonts() {
  const dir = join(process.cwd(), "assets/fonts");
  const [regular, bold] = await Promise.all([
    readFile(join(dir, "atkinson-hyperlegible-next-latin-400-normal.woff")),
    readFile(join(dir, "atkinson-hyperlegible-next-latin-700-normal.woff")),
  ]);
  return [
    { name: "Atkinson", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Atkinson", data: bold, weight: 700 as const, style: "normal" as const },
  ];
}

/** What a card shows: the full result, or only its headline when its release is missing. */
export interface CardSource {
  view: ResultView | null;
  headline: string;
}

export interface CardText {
  label: string;
  title: string;
  /** The tagline (closest perspective) or the outcome's subtitle; empty for In between. */
  line: string;
  /** Closest perspective: its one-line summary. Empty for other outcomes and for releases before taxonomy 0.2.1. */
  summary: string;
  /** In between: each perspective's name and summary (its tagline in releases without summaries). */
  pair: { name: string; summary: string }[];
}

export function cardText({ view, headline }: CardSource): CardText {
  const card = getCopy().share.card;
  if (!view) return { label: card.label_other, title: headline, line: "", summary: "", pair: [] };
  if (view.outcome === "matched") {
    const p = view.ranking[0];
    return { label: card.label_matched, title: p.name, line: p.tagline, summary: p.cardSummary ?? "", pair: [] };
  }
  if (view.outcome === "mixed_between") {
    const [a, b] = view.ranking;
    return {
      label: card.label_other,
      title: fill(card.title.mixed_between, { p1: a.name, p2: b.name }),
      line: "",
      summary: "",
      pair: [a, b].map((p) => ({ name: p.name, summary: p.cardSummary ?? p.tagline })),
    };
  }
  const o = view.outcome === "undecided" && view.undecidedReason === "middle" ? "undecided_middle" : view.outcome;
  return { label: card.label_other, title: card.title[o], line: card.subtitle[o], summary: "", pair: [] };
}

export function cardAlt(source: CardSource): string {
  return fill(getCopy().share.card.alt, { site: getCopy().site.name, title: cardText(source).title });
}

function host(): string {
  return new URL(process.env.SITE_URL ?? "https://findmyaiworldview.maplesparklabs.com").host;
}

/**
 * The largest font size, from `max` down to `min`, at which `text` wraps to
 * at most `lines` lines in `width` px. Bold Atkinson averages about 0.6em a
 * character (`em`); lines break at spaces and after hyphens, as next/og breaks them.
 */
export function fitTitle(text: string, width: number, lines: number, max: number, min: number, em = 0.6): number {
  // Each piece is a word, or part of a hyphenated word, with whether a space follows it.
  const pieces = text.split(" ").flatMap((word) => word.split(/(?<=-)/).map((part, i, all) => ({ part, space: i === all.length - 1 })));
  for (let size = max; size > min; size -= 2) {
    const perLine = width / (size * em);
    let count = 1;
    let used = 0;
    for (const { part, space } of pieces) {
      if (used > 0 && used + part.length > perLine) {
        count++;
        used = 0;
      }
      used += part.length + (space ? 1 : 0);
    }
    if (count <= lines) return size;
  }
  return min;
}

/** Mix two #rrggbb colours: `amount` of `a` over `b`. */
function mix(a: string, b: string, amount: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) * amount + ch(b, i) * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
}

export async function shareCard(source: CardSource, size: { width: number; height: number }): Promise<ImageResponse> {
  const copy = getCopy();
  const { label, title, line, summary, pair } = cardText(source);
  const view = source.view;
  const trackList = view?.tracks ?? [];
  const square = size.width === size.height;
  const padX = 64;
  const padY = 56;
  const cardWidth = 470;
  const gap = 48;
  /** The words column's width: beside the card on the wide image, the full width on the square one. */
  const wordsWidth = square ? size.width - 2 * padX : size.width - 2 * padX - gap - cardWidth;
  const matched = view?.outcome === "matched";
  const between = pair.length > 0;
  const titleSize = between ? fitTitle(title, wordsWidth, 2, 50, 30) : fitTitle(title, wordsWidth, 2, 88, 40);
  const titleLine = Math.round(titleSize * (between ? 1.12 : 1.05));
  const hostLine = `${copy.site.name} · ${host()}`;
  // One line where it fits at 18px or more; regular weight runs about 0.52em a character.
  const hostSize = fitTitle(hostLine, wordsWidth, 1, 22, 18, 0.52);
  const trackLine = mix(color["line-strong"], color["surface-raised"], 0.75);

  const tracks = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: square ? "100%" : cardWidth,
        flexGrow: square ? 1 : 0,
        flexShrink: 0,
        padding: "4px 24px",
        borderRadius: 12,
        border: `1px solid ${color.line}`,
        background: color["surface-raised"],
      }}
    >
      {trackList.map((t, i) => {
        const [low, high] = copy.share.card.ends[t.construct] ?? [t.lowLabel, t.highLabel];
        return (
          <div
            key={t.construct}
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 3,
              flexGrow: 1,
              flexBasis: 0,
              borderTop: i === 0 ? "none" : `1px solid ${color.line}`,
            }}
          >
            <span style={{ fontSize: 20, lineHeight: "26px", fontWeight: 700 }}>{t.name}</span>
            {/* Drawn like the page's track: a line with end caps and a centre mark, the dot kept inside at both ends. */}
            <div style={{ display: "flex", position: "relative", height: 22 }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: 10, height: 2, borderRadius: 999, background: trackLine }} />
              <div style={{ position: "absolute", left: 0, top: 6, width: 2, height: 10, borderRadius: 999, background: color["line-strong"] }} />
              <div style={{ position: "absolute", right: 0, top: 6, width: 2, height: 10, borderRadius: 999, background: color["line-strong"] }} />
              <div style={{ position: "absolute", left: "50%", top: 3, width: 2, height: 16, marginLeft: -1, borderRadius: 999, background: color["line-strong"] }} />
              {t.position !== null && (
                // The page's calc(9px + (100% - 18px) * position), spelled as an inset box for next/og.
                <div style={{ display: "flex", position: "absolute", left: DOT / 2, right: DOT / 2, top: 2, height: DOT }}>
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: `${(t.position * 100).toFixed(2)}%`,
                      width: DOT,
                      height: DOT,
                      marginLeft: -DOT / 2,
                      borderRadius: 999,
                      background: color.accent,
                      boxShadow: `0 0 0 3px ${color["surface-raised"]}`,
                    }}
                  />
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 17, lineHeight: "22px", color: color["ink-muted"] }}>
              <span>{low}</span>
              <span>{high}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  const heading = (
    <div style={{ display: "flex", flexDirection: "column", gap: between ? 6 : 10 }}>
      <span style={{ fontSize: 24, lineHeight: "32px", color: color["ink-muted"] }}>{label}</span>
      <span style={{ fontSize: titleSize, lineHeight: `${titleLine}px`, fontWeight: 700 }}>{title}</span>
      {line && <span style={{ fontSize: 30, lineHeight: "38px", fontWeight: matched ? 700 : 400 }}>{line}</span>}
      {summary && <span style={{ fontSize: 22, lineHeight: "30px" }}>{summary}</span>}
    </div>
  );

  // next/og lays out explicit children only (no fragments), so the In between pair is its own block.
  const words = between ? (
    <div style={{ display: "flex", flexDirection: "column", gap: square ? 24 : 0, justifyContent: "space-between", flexGrow: square ? 0 : 1 }}>
      {heading}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {pair.map((p) => (
          <div key={p.name} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 24, lineHeight: "30px", fontWeight: 700 }}>{p.name}</span>
            <span style={{ fontSize: 21, lineHeight: "28px" }}>{p.summary}</span>
          </div>
        ))}
      </div>
    </div>
  ) : (
    heading
  );

  const footer = (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 26, lineHeight: "34px", fontWeight: 700 }}>{copy.share.card.ask}</span>
      <span style={{ fontSize: hostSize, lineHeight: "30px", color: color.accent }}>{hostLine}</span>
    </div>
  );

  const root = {
    width: "100%",
    height: "100%",
    display: "flex",
    padding: `${padY}px ${padX}px`,
    background: color.surface,
    color: color.ink,
    fontFamily: "Atkinson",
  } as const;

  const card = square ? (
    <div style={{ ...root, flexDirection: "column", gap: 32 }}>
      {words}
      {tracks}
      {footer}
    </div>
  ) : (
    <div style={{ ...root, flexDirection: "row", gap }}>
      <div style={{ display: "flex", flexGrow: 1, flexShrink: 1, flexBasis: 0, flexDirection: "column", justifyContent: "space-between", gap: 24 }}>
        {words}
        {footer}
      </div>
      {trackList.length > 0 && tracks}
    </div>
  );

  return new ImageResponse(card, { ...size, fonts: await fonts() });
}

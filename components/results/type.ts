// Text sizes on the result page that sit between the design system's styles
// (issue #28, the "Result page v2" boards). In rem, so browser zoom works.
export const text = {
  /** 14/20: a track's end labels. */
  ends: "text-[0.875rem] leading-[1.25rem]",
  /** 15/22: small bold labels and notes. */
  note: "text-[0.9375rem] leading-[1.375rem]",
  /** 17/26: card text. */
  card: "text-[1.0625rem] leading-[1.625rem]",
  /** 17/24: a question above its track, a perspective's tagline in a card. */
  row: "text-[1.0625rem] leading-6",
  /** 21/30: the tagline in the hero. */
  lead: "text-[1.3125rem] leading-[1.875rem]",
  /** 22/30: card headings. */
  heading: "text-[1.375rem] leading-[1.875rem]",
  /** 36/44: an outcome headline in the hero. */
  headline: "text-[2.25rem] leading-[2.75rem]",
} as const;

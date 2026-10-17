import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import { Analytics, SpeedInsights } from "@/components/analytics";
import tokens from "@/design/tokens.json";
import { getCopy } from "@/lib/content/copy";
import "./globals.css";

// Feeds --font-sans-loaded, which the generated theme puts first in --font-sans.
const sans = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  weight: "variable",
  variable: "--font-sans-loaded",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["system-ui", "sans-serif"],
});

const copy = getCopy();

export const metadata: Metadata = {
  // Absolute URLs for share previews. Set SITE_URL on preview deploys; locally it is localhost.
  metadataBase: new URL(process.env.SITE_URL ?? "https://findmyaiworldview.maplesparklabs.com"),
  title: copy.site.name,
  description: copy.landing.lede,
};

const surface = tokens.color.tokens.find((t) => t.name === "surface")!.value;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: surface.light },
    { media: "(prefers-color-scheme: dark)", color: surface.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-CA" className={sans.variable}>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

import { readFileSync } from "node:fs";

/** WCAG floors: 4.5:1 for text, 3:1 for large/UI; 7:1 is the AAA body target. */
export const AA_TEXT = 4.5;
export const AA_UI = 3;
export const AAA_BODY = 7;

export type Tokens = Record<string, string>;

/**
 * Parses the `--color-*` custom properties (the single source of truth) from
 * tokens.css. Paths resolve from the project root, where the test runner runs.
 */
export function loadTokens(): Tokens {
  const css = readFileSync("src/styles/tokens.css", "utf8");
  const tokens: Tokens = {};
  for (const [, name, hex] of css.matchAll(
    /--color-([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g,
  )) {
    tokens[name] = hex;
  }
  return tokens;
}

/** WCAG 2.x relative luminance of an sRGB hex colour. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

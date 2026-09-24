// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AA_TEXT,
  AA_UI,
  AAA_BODY,
  contrastRatio,
  loadTokens,
  relativeLuminance,
} from "./contrast";

const tokens = loadTokens();

interface Exception {
  pairing: string;
  ratio: number;
  reason: string;
}

const exceptions = JSON.parse(
  readFileSync("contrast-exceptions.json", "utf8"),
) as Exception[];
const excepted = new Map(exceptions.map((e) => [e.pairing, e]));

const SURFACES = ["bg", "surface", "surface-raised"] as const;
const FOREGROUNDS: { name: string; floor: number }[] = [
  { name: "text", floor: AA_TEXT },
  { name: "text-muted", floor: AA_TEXT },
  { name: "accent", floor: AA_UI },
];

describe("contrast gate", () => {
  for (const surface of SURFACES) {
    for (const { name, floor } of FOREGROUNDS) {
      const pairing = `${name} on ${surface}`;
      it(`${pairing} clears WCAG ${floor}:1`, () => {
        const ratio = contrastRatio(tokens[name], tokens[surface]);
        const exception = excepted.get(pairing);
        if (exception) {
          console.info(
            `contrast exception: ${pairing} = ${ratio.toFixed(2)}:1 — ${exception.reason}`,
          );
          return;
        }
        expect(ratio).toBeGreaterThanOrEqual(floor);
      });
    }
  }

  it("keeps a luminance step between adjacent surface layers", () => {
    const [bg, surface, raised] = SURFACES.map((s) =>
      relativeLuminance(tokens[s]),
    );
    expect(bg).toBeLessThan(surface);
    expect(surface).toBeLessThan(raised);
  });

  it("reports body text (text on bg) against the AAA target", () => {
    const ratio = contrastRatio(tokens.text, tokens.bg);
    if (ratio < AAA_BODY) {
      console.info(
        `body text ${ratio.toFixed(2)}:1 is below the AAA target ${AAA_BODY}:1`,
      );
    }
    expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

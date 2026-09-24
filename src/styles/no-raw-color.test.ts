// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// tokens.css is the single source of truth for raw colour; everything else must
// reference a token via var(). This test bans raw hex/rgb/hsl in components and
// stylesheets (SPEC §14). It scans .tsx/.css only, so its own pattern (a .ts
// file) is never self-flagged. Paths resolve from the project root.
const SRC_DIR = "src";
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/;

function scannableFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      scannableFiles(full, found);
    } else if (
      /\.(?:tsx|css)$/.test(entry) &&
      entry !== "tokens.css" &&
      !entry.endsWith(".test.tsx")
    ) {
      found.push(full);
    }
  }
  return found;
}

describe("no raw colours outside tokens.css", () => {
  it("every colour references a token", () => {
    const offenders: string[] = [];
    for (const file of scannableFiles(SRC_DIR)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (RAW_COLOUR.test(line)) {
            offenders.push(`${file}:${index + 1}  ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const C_STYLE = { block: /\/\*[\s\S]*?\*\//g, line: /\/\/.*$/ };
const HASH_STYLE = { block: null, line: /#.*$/ };
const POWERSHELL_STYLE = { block: /<#[\s\S]*?#>/g, line: /#.*$/ };

// Every language whose lines this project counts and caps. A `generic` project
// is whatever its author writes, so the map reaches past TypeScript: counting
// only JS and TS reported an empty codebase for a Python or Go project and
// quietly told its author every file was within the cap.
const LANGUAGES = new Map([
  [".ts", C_STYLE],
  [".tsx", C_STYLE],
  [".js", C_STYLE],
  [".jsx", C_STYLE],
  [".mjs", C_STYLE],
  [".cjs", C_STYLE],
  [".go", C_STYLE],
  [".py", HASH_STYLE],
  [".ps1", POWERSHELL_STYLE],
]);

// Tooling the scaffolder ships rather than code the author writes. Counting it
// would tell a project on its first day that it already has several hundred
// lines, and flag files nobody in that project is in a position to shorten.
const VENDORED_PREFIXES = [".claude/", ".codex/", ".agents/"];

export const HARD_CAP = 500;
const WARN_CAP = 400;

/**
 * Counts source lines of code in a file of the given extension: non-blank lines
 * that remain after stripping that language's block and line comments. A
 * pragmatic estimate, since comment markers inside string or regex literals are
 * not detected. Throws on an extension with no known comment syntax rather than
 * guessing one and silently miscounting.
 */
export function countSloc(content, extension) {
  const syntax = LANGUAGES.get(extension);
  if (syntax === undefined) {
    throw new Error(`No comment syntax known for "${extension}" files`);
  }
  const stripped = syntax.block ? content.replace(syntax.block, "") : content;
  return stripped
    .split(/\r?\n/)
    .map((line) => line.replace(syntax.line, "").trim())
    .filter((line) => line.length > 0).length;
}

/**
 * Whether a repository path is code this project owns, and so is subject to the
 * size cap: a file in a language the report knows how to read, outside the
 * scaffolded tooling.
 */
export function isOurCode(path) {
  if (!LANGUAGES.has(extname(path))) return false;
  return !VENDORED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Builds report rows from `{ path, content }` entries, sorted by raw line
 * count descending, each tagged against the size cap.
 */
export function buildReport(files) {
  return files
    .map(({ path, content }) => {
      const raw = rawLineCount(content);
      return {
        path,
        raw,
        sloc: countSloc(content, extname(path)),
        flag: flagFor(raw),
      };
    })
    .sort((a, b) => b.raw - a.raw);
}

function rawLineCount(content) {
  const lines = content.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

function flagFor(raw) {
  if (raw > HARD_CAP) return "over";
  if (raw >= WARN_CAP) return "warn";
  return "ok";
}

/** The repository root, so every path in a report reads the same way. */
export function repoRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
}

/** One file's content, or nothing if it has been deleted since git listed it. */
export function readSource(root, path) {
  try {
    return { path, content: readFileSync(join(root, path), "utf8") };
  } catch {
    return null;
  }
}

/** Whether this module was run directly rather than imported. */
export function isMain(moduleUrl) {
  if (!process.argv[1]) return false;
  return moduleUrl === pathToFileURL(process.argv[1]).href;
}

function collectFiles() {
  const root = repoRoot();
  const tracked = execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  });
  return tracked
    .split(/\r?\n/)
    .filter((path) => path.length > 0 && isOurCode(path))
    .map((path) => readSource(root, path))
    .filter((entry) => entry !== null);
}

function printReport(report, totalSloc) {
  const marker = { over: "⚠", warn: "!", ok: " " };
  console.log(`Lines of code: ${totalSloc} SLOC across ${report.length} files`);
  console.log("");
  console.log("   RAW  SLOC  FILE");
  for (const row of report) {
    const raw = String(row.raw).padStart(5);
    const sloc = String(row.sloc).padStart(5);
    console.log(`${marker[row.flag]}${raw} ${sloc}  ${row.path}`);
  }
  console.log("");
  const over = report.filter((row) => row.flag === "over");
  if (over.length > 0) {
    console.log(`⚠ ${over.length} file(s) over the ${HARD_CAP}-line cap.`);
  } else {
    console.log(`All files within the ${HARD_CAP}-line cap.`);
  }
}

function main() {
  const report = buildReport(collectFiles());
  const totalSloc = report.reduce((sum, row) => sum + row.sloc, 0);
  printReport(report, totalSloc);
}

if (isMain(import.meta.url)) main();

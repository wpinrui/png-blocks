import { execFileSync } from "node:child_process";
import { extname } from "node:path";
import process from "node:process";

import {
  buildReport,
  HARD_CAP,
  isMain,
  isOurCode,
  readSource,
  repoRoot,
} from "./loc.mjs";
import { repeatedLiterals, suspectLines } from "./smells.mjs";
import { parseDeclarations, parseFunctions } from "./ts.mjs";

// How each leftover reads in the report. smells.mjs returns a kind and leaves
// the wording here, so the scanner stays free of the report's voice. A kind
// added there without a line here degrades to its own name rather than printing
// "undefined" at a reviewer.
const LEFTOVER_WORDING = {
  "commented-out-code": "commented-out code",
  debugger: "`debugger` left in",
  "focused-test": "focused test skips the rest of the file",
};

/** How one leftover kind reads, falling back to the kind's own name. */
export function wordFor(kind) {
  return LEFTOVER_WORDING[kind] ?? kind;
}

/** Every kind that has wording, so a test can check the scanner against it. */
export function wordedKinds() {
  return Object.keys(LEFTOVER_WORDING);
}

// The auditable half of the engineering bar. A review agent that hunts these by
// hand spends its turns counting parameters instead of reading for defects, and
// misses one whenever the diff is long. A script never miscounts, so the agent
// is left to judge the findings rather than find them.
const FUNCTION_FLAG = 50;
const FUNCTION_CAP = 75;
const NESTING_CAP = 3;
const PARAMETER_CAP = 3;
const LITERAL_REPEATS = 3;

// Below this a name is too common to attribute: a two-letter helper collides
// with a loop variable somewhere and reads as called when nothing calls it.
const SHORTEST_TRACKED_NAME = 3;

// Files ts.mjs can measure.
const PARSED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

// Files that can name a symbol and so count as callers. Config and markup wire
// things by name, so an export reached only from a JSON or HTML file is live.
// Markdown is left out: a function mentioned in the README but called nowhere
// is exactly the dead code this pass is looking for.
const INDEXED_EXTENSIONS = new Set([
  ...PARSED_EXTENSIONS,
  ".json",
  ".css",
  ".html",
  ".yml",
  ".yaml",
  ".ps1",
]);

/** Whether a path holds tests, whose calls do not keep production code alive. */
export function isTestPath(path) {
  return /(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
}

/**
 * Whether a path is content this project ships rather than code it runs. A
 * preset template is written to be called from the project it is copied into,
 * so nothing here calls it and every symbol in it would read as dead.
 *
 * Anchored to the preset tree rather than to any directory named `templates`,
 * because this file ships verbatim into every scaffolded project, where a
 * `src/templates/` of ordinary runtime code must still be audited.
 */
export function isPayload(path) {
  return /(?:^|\/)src\/presets\/[^/]+\/templates\//.test(path);
}

function tokenCounts(content) {
  const counts = new Map();
  for (const token of content.match(/[A-Za-z_$][\w$]*/g) ?? []) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function isAttributable(declaration) {
  if (declaration.exported === true) return false;
  return declaration.name.length >= SHORTEST_TRACKED_NAME;
}

function countUses(index, name, declaredIn) {
  let production = 0;
  let tests = 0;
  for (const file of index) {
    let seen = file.counts.get(name) ?? 0;
    if (file.path === declaredIn) seen -= 1;
    if (seen <= 0) continue;
    if (file.isTest) tests += seen;
    else production += seen;
  }
  return { production, tests };
}

/**
 * Declarations nothing in production calls, split into the outright dead and
 * the ones only tests reach. Counting is by identifier across the whole
 * project, so two classes with a same-named method vouch for each other: the
 * pass under-reports rather than accusing live code of being dead.
 */
export function findUnusedSymbols(sources) {
  const index = sources.map((source) => ({
    path: source.path,
    isTest: isTestPath(source.path),
    counts: tokenCounts(source.content),
  }));
  const unused = [];
  for (const source of sources) {
    if (!PARSED_EXTENSIONS.has(extname(source.path))) continue;
    for (const declaration of parseDeclarations(source.content)) {
      if (!isAttributable(declaration)) continue;
      const uses = countUses(index, declaration.name, source.path);
      if (uses.production > 0) continue;
      // A helper declared inside a test file is meant to be reached only from
      // tests. It is dead when nothing reaches it at all, not merely when
      // production does not.
      if (isTestPath(source.path) && uses.tests > 0) continue;
      unused.push({ ...declaration, path: source.path, ...uses });
    }
  }
  return unused;
}

/** Every breach of a size cap in one file. */
export function breachesIn(path, content) {
  const breaches = [];
  for (const unit of parseFunctions(content)) {
    const where = `${path}:${unit.line} ${unit.name}()`;
    if (unit.parameters > PARAMETER_CAP) {
      breaches.push(
        `${where}  ${unit.parameters} parameters (cap ${PARAMETER_CAP}, pass an object)`,
      );
    }
    if (unit.depth > NESTING_CAP) {
      breaches.push(
        `${where}  nesting depth ${unit.depth} (cap ${NESTING_CAP}, use guard clauses)`,
      );
    }
    if (unit.lines > FUNCTION_CAP) {
      breaches.push(`${where}  ${unit.lines} lines (cap ${FUNCTION_CAP})`);
    } else if (unit.lines > FUNCTION_FLAG) {
      breaches.push(
        `${where}  ${unit.lines} lines (over the ${FUNCTION_FLAG} guide, under the ${FUNCTION_CAP} cap)`,
      );
    }
  }
  return breaches;
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

/**
 * Every file the audit can read, including ones written but not yet added. A
 * new file is exactly where a fresh breach lives, and listing only the index
 * put it in scope while leaving it unparsed, so the report affirmed the caps
 * over code it had never opened.
 */
function projectSources(root) {
  return git(root, ["ls-files", "--cached", "--others", "--exclude-standard"])
    .split(/\r?\n/)
    .filter((path) => path !== "" && INDEXED_EXTENSIONS.has(extname(path)))
    .map((path) => readSource(root, path))
    .filter((source) => source !== null);
}

/**
 * The paths a branch has touched, from `git diff --name-only` and
 * `git status --porcelain`. Porcelain lines carry a two-letter status, and a
 * rename arrives as "old -> new", of which only the new path exists to read.
 */
export function changedPaths(diffOutput, statusOutput) {
  const committed = diffOutput.split(/\r?\n/);
  const working = statusOutput
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => line.slice(3).trim())
    .map((path) => (path.includes(" -> ") ? path.split(" -> ")[1] : path))
    .map((path) => path.replace(/^"|"$/g, ""));
  return [...new Set([...committed, ...working].filter((path) => path !== ""))];
}

/**
 * What to compare a branch against. `origin/main` rather than `main`, because a
 * local main that has not been pulled since the last merge reports every commit
 * landed in the meantime as part of this branch.
 */
function trunk(root) {
  try {
    git(root, ["rev-parse", "--verify", "--quiet", "origin/main"]);
    return "origin/main";
  } catch {
    return "main";
  }
}

/**
 * Paths under review, with the reason they were chosen: the branch's own changes
 * plus anything still uncommitted, or the whole project under `--all`. Falls
 * back to the whole project when there is no trunk to compare against, rather
 * than reporting nothing.
 *
 * The mode travels with the paths because the fallback is silent otherwise, and
 * a whole-project report read as a branch report puts untouched code in front of
 * a reviewer as though this branch had written it.
 */
export function scopeFrom(argv, root, sources) {
  const everything = () => sources.map((source) => source.path);
  if (argv.includes("--all")) {
    return { paths: everything(), mode: "whole project (--all)" };
  }
  try {
    const against = trunk(root);
    return {
      paths: changedPaths(
        git(root, ["diff", "--name-only", `${against}...HEAD`]),
        // --untracked-files=all, because the default collapses a wholly new
        // directory to one "?? dir/" line, and a directory path matches no file.
        git(root, ["status", "--porcelain", "--untracked-files=all"]),
      ),
      mode: `this branch against ${against}, plus the working tree`,
    };
  } catch {
    return {
      paths: everything(),
      mode: "whole project (no trunk to compare against)",
    };
  }
}

function printSection(title, rows, empty) {
  console.log("");
  console.log(title);
  if (rows.length === 0) {
    console.log(`  ${empty}`);
    return;
  }
  for (const row of rows) console.log(`  ${row}`);
}

function sizeRows(sized) {
  return buildReport(sized)
    .filter((row) => row.flag !== "ok")
    .map((row) =>
      row.flag === "over"
        ? `${row.path}  ${row.raw} lines, OVER the ${HARD_CAP} cap`
        : `${row.path}  ${row.raw} lines, approaching the ${HARD_CAP} cap`,
    );
}

function unusedRows(sources, scope) {
  const rows = findUnusedSymbols(sources).map((symbol) => {
    const mark = scope.includes(symbol.path) ? "changed" : "elsewhere";
    const reach =
      symbol.tests > 0
        ? `reached only by tests (${symbol.tests} use(s))`
        : "no caller anywhere";
    return `${symbol.path}:${symbol.line} ${symbol.name} (${symbol.kind}): ${reach} [${mark}]`;
  });
  return rows.sort(
    (left, right) =>
      Number(right.endsWith("[changed]")) - Number(left.endsWith("[changed]")),
  );
}

function literalRows(parsed) {
  // A figure spelled out across a test file is that test's data. In production
  // the same repetition is the magic number the bar rejects.
  return parsed
    .filter((source) => !isTestPath(source.path))
    .flatMap((source) =>
      repeatedLiterals(source.content, LITERAL_REPEATS).map(
        (row) => `${source.path}  ${row.literal} appears ${row.count} times`,
      ),
    );
}

function leftoverRows(parsed) {
  return parsed.flatMap((source) =>
    suspectLines(source.content).map(
      (row) => `${source.path}:${row.line}  ${wordFor(row.kind)}`,
    ),
  );
}

/**
 * Every section of the report, in the order they are printed.
 *
 * `sized` and `parsed` are the same set of files read two ways, so a file can
 * never be capped by one section and ignored by another. `indexed` is the wider
 * whole-project view the uncalled-symbol pass needs, since a change here can
 * orphan code anywhere: it carries its own `sources` and the `scope` used only
 * to mark a row as changed or elsewhere.
 */
export function sections(sized, parsed, indexed) {
  return [
    ["FILE SIZE", sizeRows(sized), "every file within the cap"],
    [
      "FUNCTIONS (length, parameters, nesting)",
      parsed.flatMap((source) => breachesIn(source.path, source.content)),
      "no function over a cap",
    ],
    [
      "UNCALLED SYMBOLS (whole project, so a change that orphans code shows up)",
      unusedRows(indexed.sources, indexed.scope),
      // Exports are skipped by isAttributable, since their caller may be
      // anywhere, so this line must not claim more than was measured.
      "every unexported declaration has a production caller (exports are not checked)",
    ],
    [
      "REPEATED LITERALS (candidates for a named constant, production only)",
      literalRows(parsed),
      "no number repeated three times in a file",
    ],
    [
      "LEFTOVERS",
      leftoverRows(parsed),
      "no commented-out code, debugger or focused test",
    ],
  ];
}

function printFooter() {
  console.log("");
  console.log(
    "NOT AUDITED HERE, still yours to judge: correctness, SOLID, DRY across files,",
  );
  console.log(
    "abstraction level, feature envy, primitive obsession, flag arguments, whether a",
  );
  console.log(
    "test can actually fail, doc drift, and whether any breach above is justified.",
  );
}

/**
 * Code this project owns and is answerable for: not vendored tooling, not
 * shipped payload, and inside the scope under review. One predicate, so the
 * capped set and the parsed set can never disagree.
 */
function auditable(source, scope) {
  if (!scope.includes(source.path)) return false;
  if (isPayload(source.path)) return false;
  return isOurCode(source.path);
}

function printAudit(sources, scope) {
  const sized = sources.filter((source) => auditable(source, scope.paths));
  const parsed = sized.filter((source) =>
    PARSED_EXTENSIONS.has(extname(source.path)),
  );
  const indexed = {
    sources: sources.filter((source) => !isPayload(source.path)),
    scope: scope.paths,
  };
  console.log(
    `Mechanical audit: ${scope.paths.length} path(s) in scope, ${parsed.length} source file(s) parsed`,
  );
  console.log(`Scope: ${scope.mode}`);
  for (const [title, rows, empty] of sections(sized, parsed, indexed)) {
    printSection(title, rows, empty);
  }
  printFooter();
}

function main(argv) {
  const root = repoRoot();
  const sources = projectSources(root);
  printAudit(sources, scopeFrom(argv, root, sources));
}

if (isMain(import.meta.url)) main(process.argv.slice(2));

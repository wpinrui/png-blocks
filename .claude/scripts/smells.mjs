import { blankBlockComments, stripComment, stripStrings } from "./ts.mjs";

// The pattern half of the audit: things that read as a smell rather than things
// that can be counted. It borrows ts.mjs's lexer so a construct named inside a
// string or a comment is not mistaken for the real thing, but it measures
// nothing, which is why it lives apart from the reader.
//
// Every finding is returned as a `kind`, never as finished prose. The wording
// belongs to whoever prints the report.

const COMMENTED_CODE = new RegExp(
  [
    // A statement shape, not merely a line opening with a keyword.
    "^\\s*//\\s*(?:",
    "(?:const|let|var)\\s+[\\w$]+\\s*[=:]",
    "|function\\s+[\\w$]+\\s*\\(",
    "|class\\s+[\\w$]+\\s*(?:\\{|extends\\b)",
    "|import\\s*[{*]|import\\s+[\\w$]+\\s+from\\b|import\\s+[\"']",
    "|export\\s+(?:const|let|var|function|class|default|type|interface)\\b",
    "|(?:if|for|while|switch|catch)\\s*\\(",
    "|console\\.\\w+\\s*\\(",
    "|throw\\s+new\\s",
    ")",
    // Or anything in a comment that closes like a statement does.
    "|^\\s*//.*[;{]\\s*$",
  ].join(""),
);

const DEBUGGER = /(?:^|[^\w$])debugger\s*;?\s*$/;

const FOCUSED_TEST = /(?:^|[^\w$])(?:describe|it|test|bench)\.only\s*\(/;

// Numbers too ordinary to mean anything: an index, a half, an empty count.
const TRIVIAL_LITERALS = new Set([
  "0",
  "1",
  "2",
  "3",
  "0.0",
  "1.0",
  "0.5",
  "100",
]);

// A magic number's fix is a named constant, so a line that already declares one
// is not the smell. Local `const`s are not exempt: naming a value `x` inside a
// function does not make 86400 self-explanatory.
const NAMED_CONSTANT = /^\s*(?:export\s+)?const\s+[A-Z][A-Z0-9_]*\s*[:=]/;

const NUMERIC_LITERAL = /(?<![\w.$])\d+(?:\.\d+)?(?![\w.])/g;

/**
 * Numbers spelled out often enough in one file to want a name. Lines that
 * already declare a named constant are skipped: those are the fix, not the
 * smell.
 */
export function repeatedLiterals(content, repeats) {
  const counts = new Map();
  for (const line of blankBlockComments(content).split(/\r?\n/)) {
    const code = stripStrings(stripComment(line));
    if (NAMED_CONSTANT.test(code)) continue;
    for (const literal of code.match(NUMERIC_LITERAL) ?? []) {
      if (TRIVIAL_LITERALS.has(literal)) continue;
      counts.set(literal, (counts.get(literal) ?? 0) + 1);
    }
  }
  return [...counts]
    .filter(([, count]) => count >= repeats)
    .sort((left, right) => right[1] - left[1])
    .map(([literal, count]) => ({ literal, count }));
}

/**
 * Every kind `suspectLines` can return. Exported so whoever words these can
 * check it has a line for each, rather than discovering a gap when a report
 * prints a bare kind at a reviewer.
 */
export const SUSPECT_KINDS = ["commented-out-code", "debugger", "focused-test"];

/** The kind of leftover a line reads as, or nothing if it reads as code. */
function suspectKind(raw) {
  if (COMMENTED_CODE.test(raw)) return "commented-out-code";
  // String contents go before the tests below, so a test that asserts on the
  // very thing being detected does not report itself.
  const code = stripStrings(stripComment(raw));
  if (DEBUGGER.test(code)) return "debugger";
  if (FOCUSED_TEST.test(code)) return "focused-test";
  return null;
}

/**
 * Lines that read as leftovers: code left behind in a comment, a `debugger`
 * nobody meant to keep, and a focused test that silently skips every other test
 * in its file.
 */
export function suspectLines(content) {
  const lines = blankBlockComments(content).split(/\r?\n/);
  const suspects = [];
  for (let at = 0; at < lines.length; at += 1) {
    const kind = suspectKind(lines[at]);
    if (kind !== null) suspects.push({ line: at + 1, kind });
  }
  return suspects;
}

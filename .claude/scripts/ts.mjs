// Enough of TypeScript to measure it. Nothing here parses the language
// properly. The shapes the engineering bar caps, meaning how long a function
// runs, how many parameters it takes and how deeply it nests, are all readable
// from braces and a handful of keywords, and a real parser would be a
// dependency a script running in a freshly scaffolded project cannot have.
// Text in, numbers out; what the numbers mean is audit.mjs's business, and
// the pattern half of the audit lives in smells.mjs.
//
// Four limits, all deliberate, all under-reporting. A `{` counts toward nesting
// only when a control keyword opens it, so object literals and JSX expression
// containers read as depth zero instead of inflating every component in the
// report. String tracking resets at each line break, so a template literal left
// open across lines stops being followed. Regex literals are not lexed, so the
// `//` inside one (`/\/\*.*\*\//g`) reads as a comment and truncates the line.
// And a const with a function-typed annotation is not matched at all, since the
// annotation swallows the `=` the pattern needs.
//
// The last three can lose a brace and leave a walk unable to find its closing
// line. Every such walk returns nothing and the function is dropped from the
// report, never guessed at: the audit's rows are adjudicated by a reviewer and
// never treated as a gate, so a row this misses costs far less than one it
// invents.

const DECLARED_FUNCTION =
  /^[\t ]*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^(]*>)?\s*\(/;

const ASSIGNED_FUNCTION =
  /^[\t ]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\s*\*?\s*[A-Za-z_$]*\s*)?(?:<[^(]*>)?\s*\(/;

const METHOD =
  /^[\t ]*(?:(?:public|private|protected|static|async|get|set|override|readonly)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^(]*>)?\s*\(/;

// Keywords that take a parenthesised head and would otherwise read as a method
// name. `constructor` is deliberately absent: it is a real method with a body,
// and it is the classic home of the long parameter list the bar caps.
const NOT_A_NAME = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "typeof",
  "await",
  "yield",
  "function",
]);

const TOP_LEVEL_DECLARATION =
  /^(export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(function|const|let|var|class|interface|type|enum)\s+\*?\s*([A-Za-z_$][\w$]*)/;

/**
 * Blanks the contents of block comments while preserving every line break and
 * column, so line numbers and offsets measured afterwards still point at the
 * real source.
 */
export function blankBlockComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
}

/**
 * Drops a trailing `//` comment, ignoring slashes inside string literals so a
 * URL or a path in a string does not swallow the rest of the line.
 */
export function stripComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote !== null) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
    } else if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if (character === "/" && line[index + 1] === "/") {
      return line.slice(0, index);
    }
  }
  return line;
}

/**
 * Drops the contents of string literals, escapes included. A regex pairing
 * quotes cannot do this: it closes on the `\"` inside "a \"b\" c" and hands
 * back the middle of the string as if it were code, which is how a test that
 * names the very thing being detected ends up reporting itself.
 */
export function stripStrings(line) {
  let kept = "";
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote !== null) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    kept += character;
  }
  return kept;
}

/**
 * How much a character shifts bracket depth. Angle brackets carry TypeScript's
 * generics and have to count, but `<=`, `>=` and the `=>` of an arrow are
 * operators, and reading those as brackets drives the depth negative and makes
 * the rest of a signature unreadable.
 */
function bracketDelta(text, index) {
  const character = text[index];
  if ("([{".includes(character)) return 1;
  if (")]}".includes(character)) return -1;
  if (character === "<") return text[index + 1] === "=" ? 0 : 1;
  if (character !== ">") return 0;
  return text[index + 1] === "=" || text[index - 1] === "=" ? 0 : -1;
}

/**
 * Walks the code characters of `lines` from a starting position, skipping the
 * contents of string literals, calling `visit(character, line, index)` for each
 * one. The first value `visit` returns ends the walk and becomes its result.
 */
function walkCode(lines, start, visit) {
  let quote = null;
  let index = start.index;
  for (let line = start.line; line < lines.length; line += 1) {
    const source = stripComment(lines[line]);
    for (; index < source.length; index += 1) {
      const character = source[index];
      if (quote !== null) {
        if (character === "\\") index += 1;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
        continue;
      }
      const result = visit(character, line, index);
      if (result !== undefined) return result;
    }
    quote = null;
    index = 0;
  }
  return undefined;
}

/**
 * Splits a parameter list on its top-level commas. Generics, destructuring,
 * inline object types and defaulted values all carry their own brackets and
 * commas (`Record<string, number>`, `{ a, b }`, `= [1, 2]`), so a plain split
 * overcounts badly.
 */
export function splitParameters(text) {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  const parameters = [];
  let depth = 0;
  let start = 0;
  let quote = null;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (quote !== null) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "," && depth === 0) {
      parameters.push(trimmed.slice(start, index));
      start = index + 1;
      continue;
    }
    depth += bracketDelta(trimmed, index);
  }
  parameters.push(trimmed.slice(start));
  return parameters.map((part) => part.trim()).filter((part) => part !== "");
}

/**
 * Whether the code before a `{` is what opens it. Only control flow counts:
 * this is the arrowhead the bar rejects, and ignoring every other brace is what
 * keeps object literals and JSX from reading as nesting.
 */
function opensControlFlow(prefix) {
  const code = prefix.trim();
  if (/^(?:\}\s*)?(?:else|do|try|finally)$/.test(code)) return true;
  return /^(?:\}\s*)?(?:else\s+)?(?:if|for|while|switch|catch)\b.*\)$/.test(
    code,
  );
}

/**
 * Deepest control-flow nesting reached inside a function body, counting
 * enclosing branches and loops but not the braces of the objects, callbacks and
 * JSX they contain.
 */
export function deepestNesting(bodyLines) {
  const stack = [];
  let deepest = 0;
  walkCode(bodyLines, { line: 0, index: 0 }, (character, line, index) => {
    if (character === "{") {
      const prefix = stripComment(bodyLines[line]).slice(0, index);
      stack.push(opensControlFlow(prefix));
      deepest = Math.max(deepest, stack.filter(Boolean).length);
    } else if (character === "}") {
      stack.pop();
    }
    return undefined;
  });
  return deepest;
}

/** The parameter text between a signature's parentheses, and where it closes. */
function readSignature(lines, start) {
  let depth = 0;
  let text = "";
  return (
    walkCode(lines, start, (character, line, index) => {
      depth += character === "(" ? 1 : character === ")" ? -1 : 0;
      if (character === ")" && depth === 0) return { text, line, index };
      if (depth >= 1 && !(character === "(" && depth === 1)) text += character;
      return undefined;
    }) ?? null
  );
}

// What may stand between a signature's `)` and its body: a return type, an
// arrow, and nothing else. Anything further along the line means the match was
// never a function. `foo(a)` followed by `.then(() => {` is a call, and a JSX
// line reading `Create <Text>{x}</Text> (a, b) in {c}` is prose.
const BLOCK_BODY = /^\s*(?::[^;{]*?)?\s*(?:=>\s*)?\{/;
const EXPRESSION_BODY = /^\s*(?::[^;{]*?)?\s*=>\s*(?=\S)/;

/** Maps an offset in the head-plus-next-line window back to a real position. */
function positionIn(start, headLength, offset) {
  if (offset < headLength) {
    return { line: start.line, index: start.index + offset };
  }
  return { line: start.line + 1, index: offset - headLength - 1 };
}

/**
 * Where a function's body begins, given where its signature closed, or nothing
 * if what follows is not a body at all. Only the rest of that line and the one
 * after it are considered, because a real body follows its signature
 * immediately and searching further turns every call into a function.
 */
function findBody(lines, start) {
  const head = stripComment(lines[start.line]).slice(start.index);
  const next =
    start.line + 1 < lines.length ? stripComment(lines[start.line + 1]) : "";
  const window = `${head}\n${next}`;
  const block = window.match(BLOCK_BODY);
  if (block !== null) {
    const at = positionIn(start, head.length, block[0].length - 1);
    return { ...at, braced: true };
  }
  const expression = window.match(EXPRESSION_BODY);
  if (expression === null) return null;
  const at = positionIn(start, head.length, expression[0].length);
  return { ...at, braced: false };
}

/**
 * The line holding the `}` that closes a block opened at `start`, or nothing if
 * the walk runs off the end without closing. Nothing, rather than the last line:
 * a walk that loses its place would otherwise report every function from there
 * on as running to end of file, and an invented over-length row is the one thing
 * this module must not produce.
 */
function blockEnd(lines, start) {
  let depth = 0;
  return walkCode(lines, start, (character, line) => {
    depth += character === "{" ? 1 : character === "}" ? -1 : 0;
    if (character === "}" && depth === 0) return line;
    return undefined;
  });
}

/** The line an expression-bodied arrow function runs out to, or nothing. */
function expressionEnd(lines, start) {
  let depth = 0;
  return walkCode(lines, start, (character, line, index) => {
    depth += bracketDelta(stripComment(lines[line]), index);
    if (depth < 0) return line;
    if (depth === 0 && character === ";") return line;
    return undefined;
  });
}

/**
 * Matches one of the three ways a function is written, giving its name and the
 * offset of the `(` that opens its parameter list. Every pattern ends on that
 * paren, so the match's own length locates it: taking the line's first `(`
 * instead would read the wrong one out of `const f: (x: number) => void = ...`.
 */
function nameAt(line) {
  for (const pattern of [DECLARED_FUNCTION, ASSIGNED_FUNCTION, METHOD]) {
    const match = line.match(pattern);
    if (match === null || NOT_A_NAME.has(match[1])) continue;
    return { name: match[1], open: match[0].length - 1 };
  }
  return null;
}

/** One function's three measurements, or nothing if the line only looked like one. */
function measure(lines, at, found) {
  const { name, open } = found;
  const signature = readSignature(lines, { line: at, index: open });
  if (signature === null) return null;
  const body = findBody(lines, {
    line: signature.line,
    index: signature.index + 1,
  });
  if (body === null) return null;
  const last = body.braced
    ? blockEnd(lines, { line: body.line, index: body.index })
    : expressionEnd(lines, { line: body.line, index: body.index });
  if (last === undefined) return null;
  return {
    name,
    line: at + 1,
    parameters: splitParameters(signature.text).length,
    lines: last - at + 1,
    depth: body.braced ? deepestNesting(lines.slice(body.line, last + 1)) : 0,
  };
}

/**
 * Every function in a TypeScript file with the three measurements the bar caps.
 * Length is the raw span from the declaration to the line that closes it,
 * matching how the file cap is counted. Nested functions are reported in their
 * own right, so the span of an outer function includes its inner ones.
 */
export function parseFunctions(content) {
  const lines = blankBlockComments(content).split(/\r?\n/);
  const functions = [];
  for (let at = 0; at < lines.length; at += 1) {
    const found = nameAt(stripComment(lines[at]));
    if (found === null) continue;
    const unit = measure(lines, at, found);
    if (unit !== null) functions.push(unit);
  }
  return functions;
}

/**
 * Named things a file declares: its top-level declarations, flagged by whether
 * they are exported, plus every function with a body found inside them, which
 * covers class methods, object methods and nested local helpers alike. Local
 * *variables* are left out, since one inside a function cannot be dead across
 * files, but a local function can be orphaned by a change and is worth counting.
 */
export function parseDeclarations(content) {
  const lines = blankBlockComments(content).split(/\r?\n/);
  const declarations = [];
  for (let at = 0; at < lines.length; at += 1) {
    const top = stripComment(lines[at]).match(TOP_LEVEL_DECLARATION);
    if (top === null) continue;
    declarations.push({
      name: top[3],
      line: at + 1,
      kind: top[2],
      exported: top[1] !== undefined,
    });
  }
  // Methods and nested helpers come from the parsed function list rather than a
  // second regex pass, so a line only counts once it has been proved to have a
  // body. Matching the shape alone reads JSX prose as a method call.
  const declared = new Set(declarations.map((entry) => entry.line));
  for (const unit of parseFunctions(content)) {
    if (declared.has(unit.line)) continue;
    declarations.push({ name: unit.name, line: unit.line, kind: "method" });
  }
  return declarations.sort((left, right) => left.line - right.line);
}

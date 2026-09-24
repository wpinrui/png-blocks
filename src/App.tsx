import { useEffect, useMemo, useRef, useState } from "react";
import {
  type BlockDef,
  CATALOG,
  CATEGORY_NAMES,
  defaultValues,
  toCode,
} from "./catalog";
import { copyPng, renderSvg } from "./render";

function BlockSvg({ code, scale }: { code: string; scale: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      el.replaceChildren(renderSvg(code, scale));
    } catch (e) {
      el.textContent = `Render error: ${String(e)}`;
    }
  }, [code, scale]);
  return <span ref={ref} style={{ display: "inline-block" }} />;
}

function InputField({
  block,
  index,
  value,
  onChange,
}: {
  block: BlockDef;
  index: number;
  value: string;
  onChange: (v: string) => void;
}) {
  const input = block.inputs[index];
  if (!input) return null;
  const listId = `opts-${block.key}-${index}`;
  const label = `Input ${index + 1} (${input.kind})`;
  if (input.kind === "boolean") {
    return <div>{label}: empty slot</div>;
  }
  return (
    <label style={{ display: "block", marginBottom: 6 }}>
      {label}:{" "}
      {input.kind === "color" ? (
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <>
          <input
            type="text"
            inputMode={input.kind === "number" ? "decimal" : "text"}
            value={value}
            list={input.options ? listId : undefined}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: "100%" }}
          />
          {input.options && (
            <datalist id={listId}>
              {input.options.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          )}
        </>
      )}
    </label>
  );
}

function matches(block: BlockDef, query: string): boolean {
  const hay =
    `${block.label} ${CATEGORY_NAMES[block.category] ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

export function App() {
  const [query, setQuery] = useState("");
  const [scale, setScale] = useState(2);
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [codeOverride, setCodeOverride] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const valuesFor = (b: BlockDef) => values[b.key] ?? defaultValues(b);
  const codeFor = (b: BlockDef) => toCode(b, valuesFor(b));

  const selected = CATALOG.find((b) => b.key === selectedKey) ?? null;
  const selectedCode = selected
    ? (codeOverride ?? codeFor(selected))
    : (codeOverride ?? "");

  const groups = useMemo(() => {
    const out: { category: string; blocks: BlockDef[] }[] = [];
    for (const b of CATALOG) {
      if (!matches(b, query)) continue;
      const last = out[out.length - 1];
      if (last?.category === b.category) last.blocks.push(b);
      else out.push({ category: b.category, blocks: [b] });
    }
    return out;
  }, [query]);

  async function copy(code: string, name: string) {
    try {
      await copyPng(code, scale);
      setStatus(`Copied "${name}" as PNG.`);
    } catch (e) {
      setStatus(`Copy failed: ${String(e)}`);
    }
  }

  function select(b: BlockDef) {
    setSelectedKey(b.key);
    setCodeOverride(null);
    void copy(codeFor(b), b.label);
  }

  function setValue(b: BlockDef, i: number, v: string) {
    const next = [...valuesFor(b)];
    next[i] = v;
    setValues({ ...values, [b.key]: next });
    setCodeOverride(null);
  }

  return (
    <div style={{ display: "flex", gap: 16, padding: 16, flexWrap: "wrap" }}>
      <aside
        style={{
          flex: "0 0 360px",
          maxWidth: "100%",
          position: "sticky",
          top: 16,
          alignSelf: "flex-start",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Scratch block PNG</h1>
        <p>Click a block to copy it as a transparent PNG.</p>
        <input
          type="search"
          placeholder="Search blocks"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: "100%" }}
        />
        <label style={{ display: "block", marginTop: 8 }}>
          PNG scale:{" "}
          <select
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          >
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={3}>3x</option>
          </select>
        </label>
        <p aria-live="polite">{status}</p>

        <h2>Editor</h2>
        {!selected && !codeOverride && <p>Click a block to edit it here.</p>}
        {selected &&
          selected.inputs.map((_, i) => (
            <InputField
              // biome-ignore lint/suspicious/noArrayIndexKey: inputs are positional
              key={i}
              block={selected}
              index={i}
              value={valuesFor(selected)[i] ?? ""}
              onChange={(v) => setValue(selected, i, v)}
            />
          ))}
        {(selected || codeOverride) && (
          <>
            <div style={{ margin: "8px 0", overflowX: "auto" }}>
              <BlockSvg code={selectedCode} scale={1} />
            </div>
            <button
              type="button"
              onClick={() => void copy(selectedCode, "edited block")}
            >
              Copy PNG
            </button>
          </>
        )}
        <label style={{ display: "block", marginTop: 8 }}>
          scratchblocks code (editable, supports nesting and stacking):
          <textarea
            value={selectedCode}
            onChange={(e) => setCodeOverride(e.target.value)}
            rows={6}
            style={{ width: "100%", fontFamily: "monospace" }}
          />
        </label>

        <h2>Attribution</h2>
        <p>
          Scratch is developed by the Lifelong Kindergarten Group at the MIT
          Media Lab. See{" "}
          <a href="https://scratch.mit.edu" target="_blank" rel="noreferrer">
            scratch.mit.edu
          </a>
          . Images of Scratch blocks are licensed under{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/2.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY-SA 2.0
          </a>
          , so PNGs copied from this page carry that license and need the same
          credit.
        </p>
        <p>
          Blocks are rendered with{" "}
          <a
            href="https://github.com/scratchblocks/scratchblocks"
            target="_blank"
            rel="noreferrer"
          >
            scratchblocks
          </a>{" "}
          by Tim Radvan and contributors (MIT license), including its block
          definitions.
        </p>
        <p>
          This site is not affiliated with, sponsored by or endorsed by the
          Scratch Foundation or MIT. Scratch is a trademark of the Scratch
          Foundation.
        </p>
      </aside>

      <main style={{ flex: "1 1 400px", minWidth: 0 }}>
        {groups.length === 0 && <p>No blocks match.</p>}
        {groups.map((g) => (
          <section key={g.category}>
            <h2>{CATEGORY_NAMES[g.category] ?? g.category}</h2>
            {g.blocks.map((b) => (
              <div key={b.key} style={{ marginBottom: 6 }}>
                <button
                  type="button"
                  title={`Copy: ${b.label}`}
                  onClick={() => select(b)}
                  style={{
                    background: "none",
                    border:
                      b.key === selectedKey
                        ? "2px solid currentColor"
                        : "2px solid transparent",
                    padding: 2,
                    cursor: "pointer",
                  }}
                >
                  <BlockSvg code={codeFor(b)} scale={0.75} />
                </button>
              </div>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}

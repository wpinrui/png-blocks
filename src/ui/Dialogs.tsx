import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { renderSvg } from "../render";
import { type DialogRequest, subscribeDialog } from "./dialog";

type Pending = DialogRequest & { resolve: (value: string | null) => void };

function argSummary(text: string): string {
  const args: string[] = [];
  for (const m of text.matchAll(/\(([^)]*)\)|<([^>]*)>/g)) {
    if (m[1] !== undefined) {
      args.push(`${m[1].trim() || "number or text"} (number or text)`);
    } else {
      args.push(`${m[2]?.trim() || "boolean"} (boolean)`);
    }
  }
  if (args.length === 0) return "";
  const count = args.length === 1 ? "1 input" : `${args.length} inputs`;
  return `${count}: ${args.join(", ")}.`;
}

function BlockPreview({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      el.replaceChildren(renderSvg(`define ${text.trim() || "block name"}`, 0.85));
    } catch {
      el.replaceChildren();
    }
  }, [text]);
  return <div className="preview" ref={ref} />;
}

export function Dialogs() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () =>
      subscribeDialog((p) => {
        setPending(p);
        setDraft(p?.initial ?? "");
      }),
    [],
  );

  useEffect(() => {
    if (!pending) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") pending.resolve(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending]);

  if (!pending) return null;

  const cancel = () => pending.resolve(null);
  const submit = () => {
    if (draft.trim()) pending.resolve(draft.trim());
  };
  const append = (part: string) => {
    setDraft(`${draft.trimEnd()} ${part}`.trimStart());
    inputRef.current?.focus();
  };
  const isBlock = pending.kind === "block";
  const editing = pending.kind === "block" && pending.editing;
  const title = isBlock
    ? editing
      ? "Edit block"
      : "Make a block"
    : pending.title;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: scrim click dismisses; Escape covers keyboard
    <div
      className="scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div
        className={`modal${isBlock ? " wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <span className={`dot ${isBlock ? "more" : pending.tone}`} />
          <div className="modal-title">{title}</div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={cancel}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="modal-body">
          {isBlock && <BlockPreview text={draft} />}
          <label className="field">
            {isBlock ? "Block text" : pending.label}
            <input
              ref={inputRef}
              className="input"
              value={draft}
              placeholder={isBlock ? "e.g. jump (height)" : pending.placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </label>
          {isBlock && (
            <div className="chips">
              <button
                type="button"
                className="chip"
                onClick={() => append("(number or text)")}
              >
                + Number or text ( )
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => append("<boolean>")}
              >
                + Boolean &lt; &gt;
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => append("label")}
              >
                + Label
              </button>
            </div>
          )}
          {isBlock ? (
            <div className="hint">
              Wrap a name in ( ) for a number or text input, or in &lt; &gt;
              for a boolean. {argSummary(draft)}
            </div>
          ) : (
            pending.hint && <div className="hint">{pending.hint}</div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-lg" onClick={cancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-lg btn-primary"
            disabled={!draft.trim()}
            onClick={submit}
          >
            {isBlock ? (editing ? "Save" : "Make block") : pending.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

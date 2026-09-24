import * as SB from "scratch-blocks";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  copyWorkspace,
  downloadWorkspace,
  estimateSize,
  isEmpty,
} from "./blocks/export";
import { MEDIA, makeTheme, setupBlocks } from "./blocks/setup";
import { searchToolboxXml, toolboxXml } from "./blocks/toolbox";
import { Dialogs } from "./ui/Dialogs";

type Tab = { id: string; name: string; xml: string };
type TabState = { tabs: Tab[]; active: string };

type Anchor = { left: number; top: number };
type Overlay =
  | { kind: "tabmenu" | "rename" | "close"; tabId: string; at: Anchor }
  | { kind: "copy"; at: Anchor };

type Toast = {
  tone: "success" | "warning" | "error";
  title: string;
  body: string;
  download?: boolean;
};

const STORAGE_KEY = "sbp-tabs";
const SCALE_KEY = "sbp-scale";
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

const newId = () => Math.random().toString(36).slice(2, 10);

function loadTabs(): TabState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TabState;
      if (parsed.tabs.length > 0) return parsed;
    }
  } catch {
    // Fall through to a fresh tab.
  }
  const id = newId();
  return { tabs: [{ id, name: "Tab 1", xml: "" }], active: id };
}

function saveTabs(state: TabState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: keep working in memory.
  }
}

function loadScale(): number {
  try {
    const n = Number(localStorage.getItem(SCALE_KEY));
    if (n >= MIN_SCALE && n <= MAX_SCALE) return n;
  } catch {
    // Use the default.
  }
  return 1;
}

function ensureDefaults(ws: SB.WorkspaceSvg) {
  const map = ws.getVariableMap();
  if (map.getVariablesOfType("").length === 0) {
    map.createVariable("my variable", "");
  }
  if (map.getVariablesOfType("broadcast_msg").length === 0) {
    map.createVariable("message1", "broadcast_msg");
  }
}

function loadXml(ws: SB.WorkspaceSvg, xml: string) {
  if (xml) {
    SB.clearWorkspaceAndLoadFromXml(SB.utils.xml.textToDom(xml), ws);
  } else {
    ws.clear();
  }
  ensureDefaults(ws);
  rerenderToolbox(ws);
}

// scratch-blocks' toolbox ignores refreshSelection; it must be forced.
function rerenderToolbox(ws: SB.WorkspaceSvg) {
  (ws.getToolbox() as unknown as { forceRerender(): void }).forceRerender();
}

const workspaceXml = (ws: SB.WorkspaceSvg) =>
  SB.Xml.domToText(SB.Xml.workspaceToDom(ws));

const hasContent = (xml: string) => /<(block|comment)\b/.test(xml);

const formatScale = (n: number) =>
  Number.isInteger(n) ? `${n}x` : `${n.toFixed(2).replace(/0$/, "")}x`;

function fileName(tabName: string) {
  const slug = tabName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `png-blocks-${slug || "blocks"}.png`;
}

async function pngSize(blob: Blob): Promise<string> {
  try {
    const bmp = await createImageBitmap(blob);
    const size = `${bmp.width} × ${bmp.height} px`;
    bmp.close();
    return size;
  } catch {
    return "PNG";
  }
}

// Anchor a popover below `el`, kept inside the viewport.
function below(el: Element, width: number, alignRight = false): Anchor {
  const r = el.getBoundingClientRect();
  const left = alignRight ? r.right - width : r.left;
  return {
    left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
    top: r.bottom + 6,
  };
}

function Logo() {
  const tab =
    "c2,0 3,1 4,2 l3,3 c1,1 2,2 4,2 h8 c2,0 3,-1 4,-2 l3,-3 c1,-1 2,-2 4,-2";
  const notch =
    "c-2,0 -3,1 -4,2 l-3,3 c-1,1 -2,2 -4,2 h-8 c-2,0 -3,-1 -4,-2 l-3,-3 c-1,-1 -2,-2 -4,-2";
  const block = (w: number) =>
    `M0,4 A4,4 0 0 1 4,0 H12 ${tab} H${w - 4} A4,4 0 0 1 ${w},4 V32 A4,4 0 0 1 ${w - 4},36 H42 ${notch} H4 A4,4 0 0 1 0,32 Z`;
  return (
    <svg width="66" height="50" viewBox="0 0 106 81" role="img">
      <title>PNG blocks!</title>
      <g transform="translate(1,37)">
        <path d={block(104)} className="logo-blue" />
        <text x="11" y="25" className="logo-text">
          blocks!
        </text>
      </g>
      <g transform="translate(1,1)">
        <path d={block(72)} className="logo-yellow" />
        <text x="11" y="25" className="logo-text">
          PNG
        </text>
      </g>
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

export function App() {
  const [state, setState] = useState<TabState>(loadTabs);
  const [query, setQuery] = useState("");
  const [scale, setScaleState] = useState(loadScale);
  const [showExtensions, setShowExtensions] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [empty, setEmpty] = useState(false);
  const [paletteWidth, setPaletteWidth] = useState(310);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  const divRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<SB.WorkspaceSvg | null>(null);
  const stateRef = useRef(state);
  const loadingRef = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const commit = (next: TabState) => {
    stateRef.current = next;
    setState(next);
    saveTabs(next);
  };

  const setScale = (n: number) => {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(n * 100) / 100));
    setScaleState(next);
    try {
      localStorage.setItem(SCALE_KEY, String(next));
    } catch {
      // Not remembered, still applied.
    }
  };

  const refreshEmpty = (ws: SB.WorkspaceSvg) => {
    setEmpty(isEmpty(ws));
    setPaletteWidth(ws.getMetricsManager().getAbsoluteMetrics().left);
  };

  const showToast = (t: Toast) => {
    window.clearTimeout(toastTimer.current);
    setToast(t);
    if (t.tone === "success") {
      toastTimer.current = window.setTimeout(() => setToast(null), 3200);
    }
  };

  // Write the live workspace into the active tab.
  const snapshot = (): TabState => {
    const ws = wsRef.current;
    const s = stateRef.current;
    if (!ws) return s;
    const xml = workspaceXml(ws);
    return {
      ...s,
      tabs: s.tabs.map((t) => (t.id === s.active ? { ...t, xml } : t)),
    };
  };

  const switchTo = (next: TabState) => {
    const ws = wsRef.current;
    commit(next);
    setOverlay(null);
    const tab = next.tabs.find((t) => t.id === next.active);
    if (ws && tab) {
      loadingRef.current = true;
      loadXml(ws, tab.xml);
      loadingRef.current = false;
      refreshEmpty(ws);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: inject once
  useEffect(() => {
    const div = divRef.current;
    if (!div) return;
    setupBlocks();
    const grid = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-grid")
      .trim();
    const ws = SB.inject(div, {
      toolbox: toolboxXml(false),
      media: MEDIA,
      theme: makeTheme(),
      zoom: { controls: true, wheel: true, startScale: 0.675 },
      grid: { spacing: 40, length: 2, colour: grid },
      comments: true,
      collapse: false,
      disable: false,
      sounds: false,
      trashcan: false,
      move: { scrollbars: true, drag: true, wheel: true },
    });
    ws.registerToolboxCategoryCallback(
      "VARIABLE",
      SB.ScratchVariables.getVariablesCategory,
    );
    ws.registerToolboxCategoryCallback(
      "PROCEDURE",
      SB.ScratchProcedures.getProceduresCategory,
    );
    wsRef.current = ws;

    const s = stateRef.current;
    loadingRef.current = true;
    loadXml(ws, s.tabs.find((t) => t.id === s.active)?.xml ?? "");
    loadingRef.current = false;
    refreshEmpty(ws);

    let timer: number | undefined;
    let toolboxTimer: number | undefined;
    ws.addChangeListener((e: SB.Events.Abstract) => {
      if (e.isUiEvent || loadingRef.current) return;
      setEmpty(isEmpty(ws));
      const type = String(e.type);
      const ev = e as { json?: { type?: string }; oldJson?: { type?: string } };
      const blockType = ev.json?.type ?? ev.oldJson?.type;
      if (type.startsWith("var_") || blockType === "procedures_definition") {
        window.clearTimeout(toolboxTimer);
        toolboxTimer = window.setTimeout(() => rerenderToolbox(ws), 100);
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => commit(snapshot()), 300);
    });

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(toolboxTimer);
      ws.dispose();
      wsRef.current = null;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshEmpty is stable in effect
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.updateToolbox(
      query.trim() ? searchToolboxXml(query, ws) : toolboxXml(showExtensions),
    );
    rerenderToolbox(ws);
    refreshEmpty(ws);
  }, [query, showExtensions]);

  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOverlay(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [overlay]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const activeTab = state.tabs.find((t) => t.id === state.active);

  function newTab() {
    const s = snapshot();
    const id = newId();
    switchTo({
      tabs: [...s.tabs, { id, name: `Tab ${s.tabs.length + 1}`, xml: "" }],
      active: id,
    });
  }

  function duplicateTab(id: string) {
    const s = snapshot();
    const tab = s.tabs.find((t) => t.id === id);
    if (!tab) return;
    const copyId = newId();
    const tabs = [...s.tabs];
    tabs.splice(s.tabs.indexOf(tab) + 1, 0, {
      ...tab,
      id: copyId,
      name: `${tab.name} copy`,
    });
    switchTo({ tabs, active: copyId });
  }

  function openRename(id: string, at: Anchor) {
    const tab = stateRef.current.tabs.find((t) => t.id === id);
    setDraft(tab?.name ?? "");
    setOverlay({ kind: "rename", tabId: id, at });
  }

  function confirmRename(id: string) {
    const name = draft.trim();
    if (!name) return;
    const s = snapshot();
    commit({
      ...s,
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, name } : t)),
    });
    setOverlay(null);
  }

  function requestClose(id: string, at: Anchor) {
    const s = snapshot();
    const tab = s.tabs.find((t) => t.id === id);
    if (!tab) return;
    if (hasContent(tab.xml)) setOverlay({ kind: "close", tabId: id, at });
    else closeTab(id);
  }

  function closeTab(id: string) {
    const s = snapshot();
    const index = s.tabs.findIndex((t) => t.id === id);
    if (index < 0) return;
    let tabs = s.tabs.filter((t) => t.id !== id);
    if (tabs.length === 0) tabs = [{ id: newId(), name: "Tab 1", xml: "" }];
    const active =
      s.active === id
        ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? "")
        : s.active;
    if (active === s.active) {
      commit({ tabs, active });
      setOverlay(null);
    } else {
      switchTo({ tabs, active });
    }
  }

  function selectTab(id: string) {
    if (id === stateRef.current.active) return;
    switchTo({ ...snapshot(), active: id });
  }

  const emptyToast: Toast = {
    tone: "warning",
    title: "Nothing to copy",
    body: "This tab has no blocks yet. Drag some in from the left.",
  };

  async function copy() {
    const ws = wsRef.current;
    if (!ws) return;
    setOverlay(null);
    if (isEmpty(ws)) {
      showToast(emptyToast);
      return;
    }
    try {
      const png = await copyWorkspace(ws, scale);
      showToast({
        tone: "success",
        title: "Copied to clipboard",
        body: `${await pngSize(png)} at ${formatScale(scale)}, transparent background`,
      });
    } catch (e) {
      showToast({
        tone: "error",
        title: "Couldn't copy",
        body: `${e instanceof Error ? e.message : String(e)}. You can download the PNG instead.`,
        download: true,
      });
    }
  }

  async function download() {
    const ws = wsRef.current;
    if (!ws) return;
    setOverlay(null);
    if (isEmpty(ws)) {
      showToast(emptyToast);
      return;
    }
    const name = fileName(activeTab?.name ?? "");
    try {
      const png = await downloadWorkspace(ws, scale, name);
      showToast({
        tone: "success",
        title: "Downloaded",
        body: `${name}, ${await pngSize(png)}`,
      });
    } catch (e) {
      showToast({
        tone: "error",
        title: "Couldn't download",
        body: e instanceof Error ? e.message : String(e),
      });
    }
  }

  function toggleCopyMenu(el: Element) {
    if (overlay?.kind === "copy") {
      setOverlay(null);
      return;
    }
    const ws = wsRef.current;
    if (ws) setSize(estimateSize(ws, 1));
    setOverlay({ kind: "copy", at: below(el, 268, true) });
  }

  const overlayTab =
    overlay && overlay.kind !== "copy"
      ? state.tabs.find((t) => t.id === overlay.tabId)
      : undefined;

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">
          <Logo />
        </h1>

        <nav className="tabs" aria-label="Tabs">
          {state.tabs.map((t) => {
            const active = t.id === state.active;
            const openMenu = (el: Element) =>
              setOverlay(
                overlay?.kind === "tabmenu" && overlay.tabId === t.id
                  ? null
                  : { kind: "tabmenu", tabId: t.id, at: below(el, 220) },
              );
            return (
              // biome-ignore lint/a11y/useSemanticElements: tab contains its own buttons
              <div
                key={t.id}
                role="tab"
                tabIndex={0}
                aria-selected={active}
                className={`tab${active ? " active" : ""}`}
                title={t.name}
                onClick={() => selectTab(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") selectTab(t.id);
                }}
                onDoubleClick={(e) =>
                  openRename(t.id, below(e.currentTarget, 280))
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(e.currentTarget);
                }}
              >
                <span className="tab-name">{t.name}</span>
                {active && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Tab options"
                    title="Tab options"
                    onClick={(e) => {
                      e.stopPropagation();
                      openMenu(e.currentTarget.closest(".tab") ?? e.currentTarget);
                    }}
                  >
                    <img
                      src={`${MEDIA}dropdown-arrow-dark.svg`}
                      width="10"
                      height="7"
                      alt=""
                    />
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Close ${t.name}`}
                  title="Close tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    requestClose(
                      t.id,
                      below(e.currentTarget.closest(".tab") ?? e.currentTarget, 280),
                    );
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="icon-btn new-tab"
            aria-label="New tab"
            title="New tab"
            onClick={newTab}
          >
            +
          </button>
        </nav>

        <div className="header-actions">
          <div className="copy-split">
            <button
              type="button"
              className="copy-main"
              title="Copy this tab as a transparent PNG"
              onClick={() => void copy()}
            >
              Copy PNG
              <span className="copy-badge">{formatScale(scale)}</span>
            </button>
            <button
              type="button"
              className="copy-caret"
              aria-label="Copy options"
              aria-expanded={overlay?.kind === "copy"}
              onClick={(e) => toggleCopyMenu(e.currentTarget.parentElement ?? e.currentTarget)}
            >
              <img src={`${MEDIA}dropdown-arrow.svg`} width="11" height="8" alt="" />
            </button>
          </div>
        </div>
      </header>

      <main className="stage">
        <div className="toolbar">
          <input
            type="search"
            className="search"
            placeholder="Search blocks"
            aria-label="Search blocks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="switch-btn"
            aria-pressed={showExtensions}
            title="Show extension categories"
            onClick={() => setShowExtensions(!showExtensions)}
          >
            <span className={`switch${showExtensions ? " on" : ""}`} />
            Extensions
          </button>
        </div>
        <div className="workspace-wrap">
          <div ref={divRef} className="workspace" />
          {empty && (
            <div
              className="empty-hint"
              style={{ "--palette-width": `${paletteWidth}px` } as CSSProperties}
            >
              <div>
                <strong>Drag blocks here</strong>
                <span>
                  Copy PNG crops the image to exactly the blocks on this tab,
                  with a transparent background.
                </span>
              </div>
            </div>
          )}
          {toast && (
            <div className="toast" role="status" aria-live="polite">
              <span className={`dot ${toast.tone}`} />
              <div className="toast-body">
                <strong>{toast.title}</strong>
                <span>{toast.body}</span>
              </div>
              {toast.download && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => void download()}
                >
                  Download PNG
                </button>
              )}
              <button
                type="button"
                className="icon-btn"
                aria-label="Dismiss"
                onClick={() => setToast(null)}
              >
                ×
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="footer">
        <div className="footer-credits">
          Scratch is developed by the Lifelong Kindergarten Group at the MIT
          Media Lab (
          <a href="https://scratch.mit.edu" target="_blank" rel="noreferrer">
            scratch.mit.edu
          </a>
          ). Block images{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/2.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY-SA 2.0
          </a>
          . Built with{" "}
          <a
            href="https://github.com/scratchfoundation/scratch-blocks"
            target="_blank"
            rel="noreferrer"
          >
            scratch-blocks
          </a>{" "}
          (Apache-2.0) and{" "}
          <a
            href="https://github.com/scratchblocks/scratchblocks"
            target="_blank"
            rel="noreferrer"
          >
            scratchblocks
          </a>{" "}
          (MIT). Not affiliated with the Scratch Foundation or MIT.
        </div>
        <div className="footer-repo">
          <GitHubMark />
          <a
            href="https://github.com/wpinrui/png-blocks"
            target="_blank"
            rel="noreferrer"
          >
            png-blocks
          </a>
          <span>by</span>
          <a href="https://github.com/wpinrui" target="_blank" rel="noreferrer">
            wpinrui
          </a>
        </div>
      </footer>

      {overlay && (
        // biome-ignore lint/a11y/noStaticElementInteractions: click-away layer; Escape covers keyboard
        <div className="backdrop" onMouseDown={() => setOverlay(null)} />
      )}

      {overlay?.kind === "tabmenu" && overlayTab && (
        <div className="popover menu" role="menu" style={overlay.at}>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => openRename(overlayTab.id, overlay.at)}
          >
            Rename<span className="menu-hint">Double-click</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => duplicateTab(overlayTab.id)}
          >
            Duplicate tab
          </button>
          <div className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="menu-item danger"
            onClick={() => requestClose(overlayTab.id, overlay.at)}
          >
            Close tab
          </button>
        </div>
      )}

      {overlay?.kind === "rename" && overlayTab && (
        <div
          className="popover panel"
          role="dialog"
          aria-label="Rename tab"
          style={overlay.at}
        >
          <label className="field">
            Tab name
            <input
              className="input"
              // biome-ignore lint/a11y/noAutofocus: popover opened on purpose
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename(overlayTab.id);
              }}
            />
          </label>
          <div className="actions">
            <button type="button" className="btn" onClick={() => setOverlay(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!draft.trim()}
              onClick={() => confirmRename(overlayTab.id)}
            >
              Rename
            </button>
          </div>
        </div>
      )}

      {overlay?.kind === "close" && overlayTab && (
        <div
          className="popover panel"
          role="alertdialog"
          aria-label="Close tab"
          style={overlay.at}
        >
          <div className="panel-title">Close “{overlayTab.name}”?</div>
          <div className="panel-text">
            The blocks on this tab will be deleted. This can't be undone.
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={() => setOverlay(null)}>
              Keep tab
            </button>
            <button
              type="button"
              className="btn btn-danger"
              // biome-ignore lint/a11y/noAutofocus: confirm is the expected next action
              autoFocus
              onClick={() => closeTab(overlayTab.id)}
            >
              Close tab
            </button>
          </div>
        </div>
      )}

      {overlay?.kind === "copy" && (
        <div className="popover copy-menu" role="menu" style={overlay.at}>
          <div className="row">
            <span className="label">Size</span>
            <span className="hint">
              {size[0] ? `${Math.ceil(size[0] * scale)} × ${Math.ceil(size[1] * scale)} px` : "No blocks yet"}
            </span>
          </div>
          <div className="presets">
            {[1, 2, 3, 4].map((v) => (
              <button
                key={v}
                type="button"
                className={`btn preset${scale === v ? " on" : ""}`}
                onClick={() => setScale(v)}
              >
                {v}x
              </button>
            ))}
          </div>
          <div className="fine">
            <span className="label" style={{ flex: 1, fontWeight: 400 }}>
              Fine-tune
            </span>
            <button
              type="button"
              className="btn"
              aria-label="Smaller"
              disabled={scale <= MIN_SCALE}
              onClick={() => setScale(scale - 0.25)}
            >
              −
            </button>
            <span className="fine-value">{scale.toFixed(2)}x</span>
            <button
              type="button"
              className="btn"
              aria-label="Larger"
              disabled={scale >= MAX_SCALE}
              onClick={() => setScale(scale + 0.25)}
            >
              +
            </button>
          </div>
          <div className="menu-sep" />
          <button type="button" className="download" onClick={() => void download()}>
            Download PNG
            <span>{fileName(activeTab?.name ?? "")}</span>
          </button>
        </div>
      )}

      <Dialogs />
    </div>
  );
}

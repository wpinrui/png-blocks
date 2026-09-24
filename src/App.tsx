import * as SB from "scratch-blocks";
import { useEffect, useRef, useState } from "react";
import { copyWorkspace } from "./blocks/export";
import { MEDIA, makeTheme, setupBlocks } from "./blocks/setup";
import { searchToolboxXml, toolboxXml } from "./blocks/toolbox";

type Tab = { id: string; name: string; xml: string };
type TabState = { tabs: Tab[]; active: string };

const STORAGE_KEY = "sbp-tabs";

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

export function App() {
  const [state, setState] = useState<TabState>(loadTabs);
  const [query, setQuery] = useState("");
  const [scale, setScale] = useState(1);
  const [showExtensions, setShowExtensions] = useState(false);
  const [status, setStatus] = useState("");
  const divRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<SB.WorkspaceSvg | null>(null);
  const stateRef = useRef(state);
  const loadingRef = useRef(false);

  const commit = (next: TabState) => {
    stateRef.current = next;
    setState(next);
    saveTabs(next);
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
    const tab = next.tabs.find((t) => t.id === next.active);
    if (ws && tab) {
      loadingRef.current = true;
      loadXml(ws, tab.xml);
      loadingRef.current = false;
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: inject once
  useEffect(() => {
    const div = divRef.current;
    if (!div) return;
    setupBlocks();
    const ws = SB.inject(div, {
      toolbox: toolboxXml(false),
      media: MEDIA,
      theme: makeTheme(),
      zoom: { controls: true, wheel: true, startScale: 0.675 },
      grid: { spacing: 40, length: 2, colour: "#ddd" },
      comments: true,
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

    let timer: number | undefined;
    let toolboxTimer: number | undefined;
    ws.addChangeListener((e: SB.Events.Abstract) => {
      if (e.isUiEvent || loadingRef.current) return;
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

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.updateToolbox(
      query.trim()
        ? searchToolboxXml(query, ws)
        : toolboxXml(showExtensions),
    );
    rerenderToolbox(ws);
  }, [query, showExtensions]);

  function newTab() {
    const s = snapshot();
    const id = newId();
    switchTo({
      tabs: [...s.tabs, { id, name: `Tab ${s.tabs.length + 1}`, xml: "" }],
      active: id,
    });
  }

  function duplicateTab() {
    const s = snapshot();
    const current = s.tabs.find((t) => t.id === s.active);
    if (!current) return;
    const id = newId();
    const index = s.tabs.indexOf(current);
    const tabs = [...s.tabs];
    tabs.splice(index + 1, 0, { ...current, id, name: `${current.name} copy` });
    switchTo({ tabs, active: id });
  }

  function renameTab(id: string) {
    const s = snapshot();
    const tab = s.tabs.find((t) => t.id === id);
    const name = window.prompt("Tab name", tab?.name ?? "");
    if (!name?.trim()) return;
    commit({
      ...s,
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, name: name.trim() } : t)),
    });
  }

  function closeTab(id: string) {
    const s = snapshot();
    const tab = s.tabs.find((t) => t.id === id);
    if (!tab || !window.confirm(`Close "${tab.name}"?`)) return;
    const index = s.tabs.indexOf(tab);
    let tabs = s.tabs.filter((t) => t.id !== id);
    if (tabs.length === 0) tabs = [{ id: newId(), name: "Tab 1", xml: "" }];
    const active =
      s.active === id
        ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? "")
        : s.active;
    switchTo({ tabs, active });
  }

  function selectTab(id: string) {
    if (id === stateRef.current.active) return;
    switchTo({ ...snapshot(), active: id });
  }

  async function copy() {
    const ws = wsRef.current;
    if (!ws) return;
    try {
      await copyWorkspace(ws, scale);
      setStatus("Copied");
    } catch (e) {
      setStatus(`Copy failed: ${String(e)}`);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          padding: 8,
        }}
      >
        {state.tabs.map((t) => (
          <span key={t.id} style={{ display: "inline-flex" }}>
            <button
              type="button"
              onClick={() => selectTab(t.id)}
              onDoubleClick={() => renameTab(t.id)}
              style={{ fontWeight: t.id === state.active ? "bold" : "normal" }}
            >
              {t.name}
            </button>
            <button
              type="button"
              aria-label={`Close ${t.name}`}
              onClick={() => closeTab(t.id)}
            >
              x
            </button>
          </span>
        ))}
        <button type="button" onClick={newTab}>
          New tab
        </button>
        <button type="button" onClick={duplicateTab}>
          Duplicate
        </button>
        <button type="button" onClick={() => renameTab(state.active)}>
          Rename
        </button>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          padding: "0 8px 8px",
        }}
      >
        <input
          type="search"
          placeholder="Search blocks"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          aria-expanded={showExtensions}
          onClick={() => setShowExtensions(!showExtensions)}
        >
          {showExtensions ? "▾" : "▸"} Extensions
        </button>
        <label>
          Size {scale.toFixed(2)}x{" "}
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          />
        </label>
        <button type="button" onClick={() => void copy()}>
          Copy PNG
        </button>
        <span aria-live="polite">{status}</span>
      </div>
      <div ref={divRef} style={{ flex: 1, minHeight: 0 }} />
      <footer style={{ padding: "4px 8px", fontSize: 12 }}>
        Scratch is developed by the Lifelong Kindergarten Group at the MIT Media
        Lab. See{" "}
        <a href="https://scratch.mit.edu" target="_blank" rel="noreferrer">
          scratch.mit.edu
        </a>
        . Block images:{" "}
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
      </footer>
    </div>
  );
}

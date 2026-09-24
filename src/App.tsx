import {
  ChevronDown,
  Clipboard,
  ClipboardCheck,
  ClipboardX,
  Download,
  FileX,
  GraduationCap,
  type LucideIcon,
  Moon,
  Plus,
  Search,
  Sun,
  X,
} from "lucide-react";
import * as SB from "scratch-blocks";
import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { version } from "../package.json";
import {
  blocksWith,
  copyBlock,
  copyWorkspace,
  downloadWorkspace,
  estimateSize,
  isEmpty,
} from "./blocks/export";
import { MEDIA, makeTheme, setupBlocks } from "./blocks/setup";
import { searchToolboxXml, toolboxXml } from "./blocks/toolbox";
import { Dialogs } from "./ui/Dialogs";
import { Tooltips } from "./ui/Tooltips";
import { TUTORIAL_KEY, Tutorial, type TutorialHost } from "./ui/Tutorial";

type Tab = { id: string; name: string; xml: string };
type TabState = { tabs: Tab[]; active: string };

type Anchor = { left: number; top: number };
type Overlay =
  | {
      kind: "tabmenu" | "rename" | "close" | "clear";
      tabId: string;
      at: Anchor;
    }
  | { kind: "copy"; at: Anchor };

type Toast = {
  tone: "success" | "warning" | "error";
  icon: LucideIcon;
  title: string;
  body: string;
  download?: boolean;
  // Show next to this point (the pointer) instead of under Copy PNG.
  at?: { x: number; y: number };
};

const STORAGE_KEY = "sbp-tabs";
const SCALE_KEY = "sbp-scale";
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const START_ZOOM = 0.675;
// Match the ext-slide-in and ext-slide-out animations in base.css.
const EXT_OPEN_MS = 350;
const EXT_CLOSE_MS = 250;
// Zoom in percent of START_ZOOM: buttons step 80, 100, 120, ...; the wheel
// moves linearly by WHEEL_PERCENT per 50px notch.
const ZOOM_STEP_PERCENT = 20;
const WHEEL_PERCENT = 10;
const MIN_ZOOM_PERCENT = 20;
const MAX_ZOOM_PERCENT = 400;

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

type Theme = "light" | "dark";
const THEME_KEY = "sbp-theme";

// Saved choice first, else the system setting.
function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Fall back to the system setting.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function tutorialDismissed(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === "1";
  } catch {
    return false;
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

type SelectableToolbox = {
  forceRerender(): void;
  getSelectedItem(): unknown;
  getToolboxItems(): { isSelectable(): boolean }[];
  setSelectedItem(item: unknown): void;
};

// scratch-blocks' toolbox ignores refreshSelection; it must be forced.
// It also starts with no category highlighted, so default to the first.
function rerenderToolbox(ws: SB.WorkspaceSvg) {
  const toolbox = ws.getToolbox() as unknown as SelectableToolbox;
  toolbox.forceRerender();
  if (!toolbox.getSelectedItem()) {
    const first = toolbox.getToolboxItems().find((i) => i.isSelectable());
    if (first) toolbox.setSelectedItem(first);
  }
}

type PositionedFlyout = {
  isVisible(): boolean;
  targetWorkspace: SB.WorkspaceSvg;
  getWidth(): number;
  getHeight(): number;
  getX(): number;
  getY(): number;
  position(): void;
  height_: number;
  CORNER_RADIUS: number;
  setBackgroundPath(width: number, height: number): void;
  positionAt_(width: number, height: number, x: number, y: number): void;
};

// Blockly pins the palette to the top of the workspace at full height.
// Start it below the search strip instead, as the toolbox does in CSS.
function offsetPalette(ws: SB.WorkspaceSvg, top: number) {
  const flyout = ws.getToolbox()?.getFlyout() as unknown as
    | PositionedFlyout
    | undefined;
  if (!flyout) return;
  flyout.getY = () => top;
  flyout.position = function (this: PositionedFlyout) {
    if (!this.isVisible() || !this.targetWorkspace.isVisible()) return;
    const view = this.targetWorkspace.getMetricsManager().getViewMetrics();
    this.height_ = Math.max(0, view.height - top);
    this.setBackgroundPath(
      this.getWidth() - this.CORNER_RADIUS,
      this.height_ - 2 * this.CORNER_RADIUS,
    );
    this.positionAt_(this.getWidth(), this.getHeight(), this.getX(), top);
  };
}

// Blockly zooms by multiplying scaleSpeed^amount. Swap that for linear
// steps, still letting Blockly do the zoom around the pointer.
function linearZoom(ws: SB.WorkspaceSvg) {
  const zoom = ws.zoom.bind(ws);
  const speed = ws.options.zoomOptions.scaleSpeed;
  ws.zoom = (x: number, y: number, amount: number) => {
    const percent = (ws.scale / START_ZOOM) * 100;
    let next: number;
    if (Math.abs(amount) === 1) {
      const steps = percent / ZOOM_STEP_PERCENT;
      next =
        amount > 0
          ? (Math.floor(steps + 1e-6) + 1) * ZOOM_STEP_PERCENT
          : (Math.ceil(steps - 1e-6) - 1) * ZOOM_STEP_PERCENT;
    } else {
      next = percent + amount * WHEEL_PERCENT;
    }
    next = Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, next));
    const target = (next / 100) * START_ZOOM;
    if (Math.abs(target - ws.scale) < 1e-9) return;
    zoom(x, y, Math.log(target / ws.scale) / Math.log(speed));
  };
}

// "Copy Block to Clipboard" in the block right-click menu, next to Delete.
// The registry is global, so the item calls whichever handler App set last.
let onCopyBlock: (block: SB.BlockSvg) => void = () => {};

function registerCopyBlockItem() {
  const registry = SB.ContextMenuRegistry.registry;
  if (registry.getItem("blockCopyPng")) return;
  registry.register({
    id: "blockCopyPng",
    weight: 3,
    scopeType: SB.ContextMenuRegistry.ScopeType.BLOCK,
    displayText: (scope) => {
      const n = scope.block ? blocksWith(scope.block).length : 1;
      return n === 1
        ? "Copy Block to Clipboard"
        : `Copy ${n} Blocks to Clipboard`;
    },
    preconditionFn: (scope) =>
      scope.block && !scope.block.isInFlyout ? "enabled" : "hidden",
    callback: (scope) => {
      if (scope.block) onCopyBlock(scope.block as SB.BlockSvg);
    },
  });
}

// Where the pointer last went down, so a toast can appear beside it.
const lastPointer = { x: 0, y: 0 };
document.addEventListener(
  "pointerdown",
  (e) => {
    lastPointer.x = e.clientX;
    lastPointer.y = e.clientY;
  },
  true,
);

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
    <svg
      width="66"
      height="50"
      viewBox="0 0 106 81"
      role="img"
      aria-label="PNG blocks!"
    >
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
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [extAnim, setExtAnim] = useState<"opening" | "closing" | null>(null);
  const [extSep, setExtSep] = useState<HTMLElement | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [empty, setEmpty] = useState(false);
  const [paletteWidth, setPaletteWidth] = useState(310);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  const [zoom, setZoom] = useState(1);
  const [zoomAt, setZoomAt] = useState<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(() => !tutorialDismissed());
  const helpRef = useRef<HTMLButtonElement>(null);
  // While the tutorial runs, the user's tab is parked here and nothing the
  // tutorial does to the workspace is saved.
  const tutorialRef = useRef<{ xml: string; query: string } | null>(null);
  const divRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<SB.WorkspaceSvg | null>(null);
  const stateRef = useRef(state);
  const loadingRef = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const toastRef = useRef<HTMLDivElement>(null);

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

  // Zoom as a percentage of the reset level, pinned above Blockly's buttons.
  const refreshZoom = (ws: SB.WorkspaceSvg) => {
    setZoom(ws.scale / START_ZOOM);
    const wrap = divRef.current?.parentElement;
    const buttons = divRef.current?.querySelectorAll(".blocklyZoom");
    if (!wrap || !buttons?.length) return;
    let top = Number.POSITIVE_INFINITY;
    let left = 0;
    let right = 0;
    for (const b of buttons) {
      const r = b.getBoundingClientRect();
      if (r.top < top) top = r.top;
      left = r.left;
      right = r.right;
    }
    const w = wrap.getBoundingClientRect();
    const x = Math.round((left + right) / 2 - w.left);
    const y = Math.round(top - w.top);
    setZoomAt((p) => (p && p.x === x && p.y === y ? p : { x, y }));
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
    // The workspace holds the tutorial's blocks, not the tab's.
    if (!ws || tutorialRef.current) return s;
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
    registerCopyBlockItem();
    const grid = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-grid")
      .trim();
    const ws = SB.inject(div, {
      toolbox: toolboxXml(false),
      media: MEDIA,
      theme: makeTheme(),
      zoom: {
        controls: true,
        wheel: true,
        startScale: START_ZOOM,
        minScale: (MIN_ZOOM_PERCENT / 100) * START_ZOOM,
        maxScale: (MAX_ZOOM_PERCENT / 100) * START_ZOOM,
      },
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
    setReady(true);
    linearZoom(ws);
    offsetPalette(
      ws,
      Number.parseFloat(getComputedStyle(div).getPropertyValue("--strip-height")),
    );
    ws.resize();

    const s = stateRef.current;
    loadingRef.current = true;
    loadXml(ws, s.tabs.find((t) => t.id === s.active)?.xml ?? "");
    loadingRef.current = false;
    refreshEmpty(ws);
    refreshZoom(ws);
    const onResize = () => refreshZoom(ws);
    window.addEventListener("resize", onResize);

    let timer: number | undefined;
    let toolboxTimer: number | undefined;
    ws.addChangeListener((e: SB.Events.Abstract) => {
      if (String(e.type) === "viewport_change") refreshZoom(ws);
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
      if (tutorialRef.current) return;
      timer = window.setTimeout(() => commit(snapshot()), 300);
    });

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(toolboxTimer);
      window.removeEventListener("resize", onResize);
      ws.dispose();
      wsRef.current = null;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshEmpty is stable in effect
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.updateToolbox(
      query.trim() ? searchToolboxXml(query, ws, showExtensions) : toolboxXml(showExtensions),
    );
    rerenderToolbox(ws);
    setExtSep(divRef.current?.querySelector<HTMLElement>(".ext-sep") ?? null);
    // The category column changes width with extensions shown.
    ws.resize();
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Applies for this visit only.
    }
  }

  // A pointer toast sits below-right of the pointer, kept in the window.
  useLayoutEffect(() => {
    const el = toastRef.current;
    if (!el) return;
    const at = toast?.at;
    if (!at) {
      el.style.left = "";
      el.style.top = "";
      return;
    }
    const m = 12;
    el.style.left = `${Math.max(m, Math.min(at.x + 14, window.innerWidth - el.offsetWidth - m))}px`;
    el.style.top = `${Math.max(m, Math.min(at.y + 14, window.innerHeight - el.offsetHeight - m))}px`;
  }, [toast]);

  const activeTab = state.tabs.find((t) => t.id === state.active);

  // Extension categories slide in after they are added, and slide out
  // before they are removed.
  function toggleExtensions() {
    if (extAnim) return;
    if (showExtensions) {
      setExtAnim("closing");
      window.setTimeout(() => {
        setShowExtensions(false);
        setExtAnim(null);
      }, EXT_CLOSE_MS);
    } else {
      setShowExtensions(true);
      setExtAnim("opening");
      window.setTimeout(() => setExtAnim(null), EXT_OPEN_MS);
    }
  }

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

  function clearTab(id: string) {
    const s = snapshot();
    const ws = wsRef.current;
    if (id === s.active && ws) {
      loadingRef.current = true;
      loadXml(ws, "");
      loadingRef.current = false;
      refreshEmpty(ws);
      commit(snapshot());
    } else {
      commit({
        ...s,
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, xml: "" } : t)),
      });
    }
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
    icon: Clipboard,
    title: "Nothing to copy",
    body: "This tab has no blocks yet. Drag some in from the left.",
  };

  const loadInto = (xml: string) => {
    const ws = wsRef.current;
    if (!ws) return;
    loadingRef.current = true;
    loadXml(ws, xml);
    loadingRef.current = false;
    refreshEmpty(ws);
  };

  const tutorialHost: TutorialHost = {
    ws: () => wsRef.current,
    canvasRect: () => {
      const r = divRef.current?.getBoundingClientRect();
      if (!r) return null;
      return new DOMRect(
        r.left + paletteWidth,
        r.top,
        r.width - paletteWidth,
        r.height,
      );
    },
    helpRect: () => helpRef.current?.getBoundingClientRect() ?? null,
    begin: () => {
      if (tutorialRef.current) return;
      const s = snapshot();
      commit(s);
      setOverlay(null);
      tutorialRef.current = {
        xml: s.tabs.find((t) => t.id === s.active)?.xml ?? "",
        query,
      };
    },
    end: () => {
      const saved = tutorialRef.current;
      if (!saved) return;
      loadInto(saved.xml);
      setQuery(saved.query);
      wsRef.current?.clearUndo();
      tutorialRef.current = null;
    },
    load: loadInto,
    setQuery,
    // Browsers refuse clipboard writes the page starts on its own, so the
    // demo only shows the toast a real copy would.
    copy: async () => {
      const ws = wsRef.current;
      if (!ws) return;
      const [w, h] = estimateSize(ws, scale);
      showToast({
        tone: "success",
        icon: ClipboardCheck,
        title: "Copied to clipboard",
        body: `${w} × ${h} px at ${formatScale(scale)} size`,
      });
    },
  };

  onCopyBlock = async (block) => {
    const at = { ...lastPointer };
    try {
      const png = await copyBlock(block, scale);
      showToast({
        tone: "success",
        icon: ClipboardCheck,
        title: "Copied to clipboard",
        at,
        body: `${await pngSize(png)} at ${formatScale(scale)} size`,
      });
    } catch (e) {
      showToast({
        tone: "error",
        icon: ClipboardX,
        title: "Couldn't copy",
        at,
        body: e instanceof Error ? e.message : String(e),
      });
    }
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
        icon: ClipboardCheck,
        title: "Copied to clipboard",
        body: `${await pngSize(png)} at ${formatScale(scale)} size`,
      });
    } catch (e) {
      showToast({
        tone: "error",
        icon: ClipboardX,
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
        icon: Download,
        title: "Downloaded",
        body: `${name}, ${await pngSize(png)}`,
      });
    } catch (e) {
      showToast({
        tone: "error",
        icon: FileX,
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
    <div
      className="app"
      style={{ "--palette-width": `${paletteWidth}px` } as CSSProperties}
    >
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
                data-tip={t.name}
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
                    data-tip="Tab options"
                    onClick={(e) => {
                      e.stopPropagation();
                      openMenu(e.currentTarget.closest(".tab") ?? e.currentTarget);
                    }}
                  >
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Close ${t.name}`}
                  data-tip="Close tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    requestClose(
                      t.id,
                      below(e.currentTarget.closest(".tab") ?? e.currentTarget, 280),
                    );
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="icon-btn new-tab"
            aria-label="New tab"
            data-tip="New tab"
            onClick={newTab}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="icon-btn theme-toggle"
            aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
            data-tip={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? (
              <Sun size={18} aria-hidden="true" />
            ) : (
              <Moon size={18} aria-hidden="true" />
            )}
          </button>
          <div className="copy-split">
            <button
              type="button"
              className="copy-main"
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
              <ChevronDown size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="stage">
        <div
          className={`workspace-wrap${showExtensions ? " ext" : ""}${extAnim ? ` ext-${extAnim}` : ""}`}
        >
          <div ref={divRef} className="workspace" />
          <div className="toolbar">
            <div className="search-wrap">
              <Search className="search-icon" size={16} aria-hidden="true" />
              <input
                type="search"
                className="search"
                placeholder="Search blocks"
                aria-label="Search blocks"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="sidebar-edge" />
          {extSep &&
            createPortal(
              <button
                type="button"
                className={`ext-toggle${showExtensions && extAnim !== "closing" ? " open" : ""}`}
                aria-expanded={showExtensions}
                aria-label={showExtensions ? "Hide extensions" : "Show extensions"}
                data-tip={showExtensions ? "Hide extensions" : "Show extensions"}
                onClick={toggleExtensions}
              >
                <ChevronDown size={18} aria-hidden="true" />
              </button>,
              extSep,
            )}
          <button
            ref={helpRef}
            type="button"
            className={`help-btn${tutorialOpen ? " hidden" : ""}`}
            aria-label="Show tutorial"
            data-tip="Tutorial"
            onClick={() => setTutorialOpen(true)}
          >
            <GraduationCap size={20} aria-hidden="true" />
          </button>
          {zoomAt && (
            <div
              className="zoom-level"
              data-tip="Zoom level"
              style={{ left: zoomAt.x, top: zoomAt.y }}
            >
              {Math.round(zoom * 100)}%
            </div>
          )}
          {empty && (
            <div className="empty-hint">
              <strong>Drag blocks here</strong>
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
          (MIT). Built with{" "}
          <a
            href="https://claude.com/claude-code"
            target="_blank"
            rel="noreferrer"
          >
            Claude Code
          </a>
          . Not affiliated with the Scratch Foundation or MIT.
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
          <span>{version} by</span>
          <a href="https://github.com/wpinrui" target="_blank" rel="noreferrer">
            Ivan
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
            disabled={
              overlayTab.id === state.active
                ? empty
                : !hasContent(overlayTab.xml)
            }
            onClick={() =>
              setOverlay({ kind: "clear", tabId: overlayTab.id, at: overlay.at })
            }
          >
            Clear tab
          </button>
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

      {overlay?.kind === "clear" && overlayTab && (
        <div
          className="popover panel"
          role="alertdialog"
          aria-label="Clear tab"
          style={overlay.at}
        >
          <div className="panel-title">Clear “{overlayTab.name}”?</div>
          <div className="panel-text">
            Every block and comment on this tab will be deleted.
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={() => setOverlay(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              // biome-ignore lint/a11y/noAutofocus: confirm is the expected next action
              autoFocus
              onClick={() => clearTab(overlayTab.id)}
            >
              Clear tab
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
          <div className="fine">
            <input
              type="range"
              className="slider"
              aria-label="Size"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
            />
            <span className="fine-value">{scale.toFixed(2)}x</span>
          </div>
          <div className="menu-sep" />
          <button type="button" className="download" onClick={() => void download()}>
            Download PNG
            <span>{fileName(activeTab?.name ?? "")}</span>
          </button>
        </div>
      )}

      {toast && (
        <div
          ref={toastRef}
          className={`toast ${toast.tone}${toast.at ? " at-pointer" : ""}`}
          role="status"
          aria-live="polite"
        >
          <toast.icon className="toast-icon" size={20} aria-hidden="true" />
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
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {ready && tutorialOpen && (
        <Tutorial host={tutorialHost} onClosed={() => setTutorialOpen(false)} />
      )}

      <Dialogs />
      <Tooltips />
    </div>
  );
}

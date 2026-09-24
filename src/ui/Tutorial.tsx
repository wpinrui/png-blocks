import * as SB from "scratch-blocks";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { inlineStyles } from "../blocks/export";

export const TUTORIAL_KEY = "sbp-tutorial-dismissed";

// What the tutorial needs from the app. It drives the real workspace; the
// app sets the user's tab aside in begin() and restores it in end().
export type TutorialHost = {
  ws: () => SB.WorkspaceSvg | null;
  canvasRect: () => DOMRect | null;
  helpRect: () => DOMRect | null;
  begin: () => void;
  end: () => void;
  load: (xml: string) => void;
  setQuery: (q: string) => void;
  copy: () => Promise<void>;
};

const STEPS = [
  {
    title: "Get started",
    text: "Learn how to copy an image of a simple loop to your clipboard.",
  },
  {
    title: "Search for a block",
    text: "Type in the search box to find any block by its words, like “repeat until”.",
  },
  {
    title: "Drag blocks onto the canvas",
    text: "Drag the blocks you want from the palette and snap them together.",
  },
  {
    title: "Copy it as a PNG",
    text: "Click Copy PNG to put an image of your blocks on the clipboard, ready to paste. The ▾ next to it sets the size or downloads a file.",
  },
];

const QUERY = "repeat until";
const SVG_NS = "http://www.w3.org/2000/svg";

type Point = { x: number; y: number };
type Cursor = Point & { ms: number; pressed: boolean; visible: boolean };
type Ghost = Point & { ms: number; svg: SVGSVGElement; w: number; h: number };
type Rect = { left: number; top: number; right: number; bottom: number };

class Cancelled extends Error {}

const hatXml = (at: Point) =>
  `<xml><block type="event_whenflagclicked" x="${at.x}" y="${at.y}"></block></xml>`;

const scriptXml = (at: Point) =>
  `<xml><block type="event_whenflagclicked" x="${at.x}" y="${at.y}"><next><block type="control_repeat_until"><value name="CONDITION"><block type="sensing_mousedown"></block></value><statement name="SUBSTACK"><block type="motion_movesteps"><value name="STEPS"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block></statement></block></next></block></xml>`;

function overlap(a: Rect, b: Rect) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

function flyoutBlock(ws: SB.WorkspaceSvg, type: string) {
  const toolbox = ws.getToolbox() as unknown as {
    getFlyout(): { getWorkspace(): SB.WorkspaceSvg };
  };
  return toolbox
    .getFlyout()
    .getWorkspace()
    .getTopBlocks(false)
    .find((b) => b.type === type) as SB.BlockSvg | undefined;
}

// A detached copy of a rendered block, for drawing it mid-drag.
function ghostOf(block: SB.BlockSvg): Omit<Ghost, "ms"> {
  const root = block.getSvgRoot();
  const r = root.getBoundingClientRect();
  const box = root.getBBox();
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(r.width));
  svg.setAttribute("height", String(r.height));
  svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
  const clone = root.cloneNode(true) as SVGGElement;
  inlineStyles(root, clone);
  clone.removeAttribute("transform");
  svg.appendChild(clone);
  return { svg, x: r.left, y: r.top, w: r.width, h: r.height };
}

function GhostView({ ghost }: { ghost: Ghost }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.replaceChildren(ghost.svg);
  }, [ghost.svg]);
  return (
    <div
      ref={ref}
      className="tutorial-ghost"
      style={{
        width: ghost.w,
        height: ghost.h,
        transform: `translate(${ghost.x}px, ${ghost.y}px)`,
        transitionDuration: `${ghost.ms}ms`,
      }}
    />
  );
}

export function Tutorial({
  host,
  onClosed,
}: {
  host: TutorialHost;
  onClosed: () => void;
}) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"opening" | "open" | "closing">(
    "opening",
  );
  const [pos, setPos] = useState<Point>({ x: 0, y: 0 });
  const [cursor, setCursor] = useState<Cursor>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    ms: 0,
    pressed: false,
    visible: false,
  });
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef(host);
  hostRef.current = host;

  const size = () => ({
    w: cardRef.current?.offsetWidth ?? 340,
    h: cardRef.current?.offsetHeight ?? 200,
  });

  const collapsedAt = (): Point => {
    const r = hostRef.current.helpRect();
    const { w, h } = size();
    if (!r) return { x: 16, y: window.innerHeight - h };
    return { x: r.left + r.width / 2 - w / 2, y: r.top + r.height / 2 - h / 2 };
  };

  // Pick the spot in the canvas that covers the least of `avoid`.
  const placeAvoiding = (avoid: Rect[]) => {
    const c = hostRef.current.canvasRect();
    const { w, h } = size();
    if (!c) return;
    const m = 20;
    const spots: Point[] = [
      { x: c.left + (c.width - w) / 2, y: c.top + (c.height - h) / 2 },
      { x: c.right - w - m, y: c.bottom - h - m },
      { x: c.left + m, y: c.bottom - h - m },
      { x: c.right - w - m, y: c.top + m },
    ];
    let best = spots[0] as Point;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const s of spots) {
      const box = { left: s.x, top: s.y, right: s.x + w, bottom: s.y + h };
      const cost = avoid.reduce((sum, a) => sum + overlap(box, a), 0);
      if (cost < bestCost) {
        best = s;
        bestCost = cost;
      }
    }
    setPos({ x: Math.max(m, best.x), y: Math.max(m, best.y) });
  };

  const center = () => {
    const { w, h } = size();
    setPos({
      x: (window.innerWidth - w) / 2,
      y: (window.innerHeight - h) / 2,
    });
  };

  // Open: start folded into the ? button, then grow to the middle.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useLayoutEffect(() => {
    hostRef.current.begin();
    setPos(collapsedAt());
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setPhase("open");
        center();
      }),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  // Run the current step's demo on a loop until the step changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: restarts per step
  useEffect(() => {
    if (phase !== "open") return;
    const h = hostRef.current;
    const ws = h.ws();
    if (!ws) return;
    let cancelled = false;
    const timers = new Set<number>();
    const wait = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const id = window.setTimeout(() => {
          timers.delete(id);
          if (cancelled) reject(new Cancelled());
          else resolve();
        }, ms);
        timers.add(id);
      });
    const move = async (x: number, y: number, ms: number) => {
      setCursor((c) => ({ ...c, x, y, ms, visible: true }));
      await wait(ms);
    };
    const press = (pressed: boolean) =>
      setCursor((c) => ({ ...c, pressed, ms: 0 }));
    const click = async () => {
      press(true);
      await wait(180);
      press(false);
    };
    const canvasPoint = (dx: number, dy: number): Point => {
      const c = h.canvasRect();
      return { x: (c?.left ?? 0) + dx, y: (c?.top ?? 0) + dy };
    };
    const wsPoint = (p: Point): Point => {
      const at = SB.utils.svgMath.screenToWsCoordinates(
        ws,
        new SB.utils.Coordinate(p.x, p.y),
      );
      return { x: Math.round(at.x), y: Math.round(at.y) };
    };
    const scriptAt = canvasPoint(60, 70);
    const scriptBox: Rect = {
      left: scriptAt.x - 20,
      top: scriptAt.y - 20,
      right: scriptAt.x + 320,
      bottom: scriptAt.y + 240,
    };
    const rectOf = (sel: string): Rect | null =>
      document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const search = document.querySelector<HTMLInputElement>(".search");
    const copyBtn = document.querySelector<HTMLElement>(".copy-main");

    const runSearch = async () => {
      h.load("");
      placeAvoiding([rectOf(".search")].filter((r): r is Rect => !!r));
      for (;;) {
        h.setQuery("");
        const r = search?.getBoundingClientRect();
        if (!r) return;
        await move(r.left + 40, r.top + r.height / 2, 700);
        await click();
        search?.classList.add("demo-focus");
        let q = "";
        for (const ch of QUERY) {
          q += ch;
          h.setQuery(q);
          await wait(90);
        }
        await wait(2200);
        search?.classList.remove("demo-focus");
        const p = canvasPoint(200, 200);
        await move(p.x, p.y, 700);
        await wait(700);
      }
    };

    const runDrag = async () => {
      h.setQuery(QUERY);
      h.load(hatXml(wsPoint(scriptAt)));
      placeAvoiding([scriptBox]);
      await wait(400);
      for (;;) {
        const hat = ws.getTopBlocks(false)[0] as SB.BlockSvg | undefined;
        const src = flyoutBlock(ws, "control_repeat_until");
        if (!hat || !src) {
          await wait(500);
          continue;
        }
        const g = ghostOf(src);
        await move(g.x + 24, g.y + 16, 800);
        press(true);
        await wait(150);
        setGhost({ ...g, ms: 0 });
        await wait(30);
        const hr = hat.getSvgRoot().getBoundingClientRect();
        const to = { x: hr.left, y: hr.bottom - 8 * ws.scale };
        setGhost({ ...g, ...to, ms: 900 });
        await move(to.x + 24, to.y + 16, 900);
        press(false);
        setGhost(null);
        const block = ws.newBlock("control_repeat_until");
        block.initSvg();
        block.render();
        if (hat.nextConnection && block.previousConnection) {
          hat.nextConnection.connect(block.previousConnection);
        }
        await wait(2000);
        block.dispose(true);
        const p = canvasPoint(420, 260);
        await move(p.x, p.y, 600);
        await wait(400);
      }
    };

    const runCopy = async () => {
      h.setQuery("");
      h.load(scriptXml(wsPoint(scriptAt)));
      const btn = copyBtn?.getBoundingClientRect();
      const toast: Rect | null = btn
        ? {
            left: window.innerWidth - 460,
            top: btn.top,
            right: window.innerWidth,
            bottom: btn.bottom + 140,
          }
        : null;
      placeAvoiding([scriptBox, ...(toast ? [toast] : [])]);
      await wait(300);
      for (;;) {
        const r = copyBtn?.getBoundingClientRect();
        if (!r) return;
        await move(r.left + r.width / 2, r.top + r.height / 2, 900);
        copyBtn?.classList.add("demo-press");
        await click();
        copyBtn?.classList.remove("demo-press");
        await h.copy();
        await wait(2600);
        const p = canvasPoint(420, 260);
        await move(p.x, p.y, 800);
        await wait(900);
      }
    };

    const runs = [
      async () => {
        h.load("");
        setCursor((c) => ({ ...c, visible: false }));
        center();
      },
      runSearch,
      runDrag,
      runCopy,
    ];
    runs[step]?.().catch((e: unknown) => {
      if (!(e instanceof Cancelled)) throw e;
    });
    return () => {
      cancelled = true;
      for (const id of timers) window.clearTimeout(id);
      setGhost(null);
      setCursor((c) => ({ ...c, pressed: false }));
      search?.classList.remove("demo-focus");
      copyBtn?.classList.remove("demo-press");
    };
  }, [step, phase]);

  const close = () => {
    if (phase === "closing") return;
    try {
      localStorage.setItem(TUTORIAL_KEY, "1");
    } catch {
      // Shows again next visit; nothing else lost.
    }
    setPhase("closing");
    setCursor((c) => ({ ...c, visible: false }));
    hostRef.current.end();
    setPos(collapsedAt());
    window.setTimeout(onClosed, 350);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: close is fresh each render
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase]);

  const last = step === STEPS.length - 1;
  const current = STEPS[step] ?? STEPS[0];

  return (
    <>
      <div className="tutorial-blocker" />
      {ghost && <GhostView ghost={ghost} />}
      <div
        ref={cardRef}
        className={`tutorial${phase === "open" ? "" : " folded"}`}
        role="dialog"
        aria-label="Tutorial"
        style={{ left: pos.x, top: pos.y }}
      >
        <div className="tutorial-head">
          <span className="tutorial-step">
            {step === 0 ? "Tutorial" : `Step ${step} of ${STEPS.length - 1}`}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close tutorial"
            title="Close tutorial"
            onClick={close}
          >
            ×
          </button>
        </div>
        <div className="tutorial-title">{current?.title}</div>
        <div className="tutorial-text">{current?.text}</div>
        <div className="tutorial-foot">
          {step > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => setStep(step - 1)}
            >
              Prev
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => (last ? close() : setStep(step + 1))}
          >
            {step === 0 ? "Start" : last ? "Done" : "Next"}
          </button>
        </div>
      </div>
      {cursor.visible && (
        <div
          className={`fake-cursor${cursor.pressed ? " pressed" : ""}`}
          style={{
            transform: `translate(${cursor.x}px, ${cursor.y}px)`,
            transitionDuration: `${cursor.ms}ms`,
          }}
        />
      )}
    </>
  );
}

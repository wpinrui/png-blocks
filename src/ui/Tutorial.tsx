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
// How long the card takes to fold into, or grow out of, the ? button;
// matches .tutorial.slow.
const COLLAPSE_MS = 1050;
const SVG_NS = "http://www.w3.org/2000/svg";

type Point = { x: number; y: number };
// iPad-style pointer: a small translucent dot that becomes a text beam over
// inputs and a highlight pad over buttons.
type Shape = { kind: "dot" | "beam" | "pad"; w: number; h: number; r: number };
const DOT: Shape = { kind: "dot", w: 18, h: 18, r: 9 };
const BEAM: Shape = { kind: "beam", w: 3, h: 20, r: 2 };
const padOver = (r: DOMRect): Shape => ({
  kind: "pad",
  w: r.width + 10,
  h: r.height + 10,
  r: 12,
});
// Rough advance of one character in the search box, for the beam to follow.
const CHAR_WIDTH = 7.2;

type Cursor = Point & {
  ms: number;
  pressed: boolean;
  visible: boolean;
  shape: Shape;
};
type Ghost = Point & { ms: number; svg: SVGSVGElement; w: number; h: number };

class Cancelled extends Error {}

const hatXml = (at: Point) =>
  `<xml><block type="event_whenflagclicked" x="${at.x}" y="${at.y}"></block></xml>`;

const scriptXml = (at: Point) =>
  `<xml><block type="event_whenflagclicked" x="${at.x}" y="${at.y}"><next><block type="control_repeat_until"><value name="CONDITION"><block type="sensing_mousedown"></block></value><statement name="SUBSTACK"><block type="motion_movesteps"><value name="STEPS"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block></statement></block></next></block></xml>`;

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
  const [expanding, setExpanding] = useState(true);
  const [cursor, setCursor] = useState<Cursor>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    ms: 0,
    pressed: false,
    visible: false,
    shape: DOT,
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

  // Put the card at a spot next to the step's action, kept on screen.
  const placeAt = (x: number, y: number) => {
    const { w, h } = size();
    const m = 16;
    setPos({
      x: Math.max(m, Math.min(x, window.innerWidth - w - m)),
      y: Math.max(m, Math.min(y, window.innerHeight - h - m)),
    });
  };

  const center = () => {
    const { w, h } = size();
    setPos({
      x: (window.innerWidth - w) / 2,
      y: (window.innerHeight - h) / 2,
    });
  };

  // Open: start folded into the ? button, then grow to the middle at the
  // same pace the card later folds back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useLayoutEffect(() => {
    hostRef.current.begin();
    setPos(collapsedAt());
    let inner = 0;
    let timer = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        setPhase("open");
        center();
        timer = window.setTimeout(() => setExpanding(false), COLLAPSE_MS);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      window.clearTimeout(timer);
    };
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
    const shape = (next: Shape) => setCursor((c) => ({ ...c, shape: next }));
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
    const scriptBox = { right: scriptAt.x + 280 };
    const search = document.querySelector<HTMLInputElement>(".search");
    const copyBtn = document.querySelector<HTMLElement>(".copy-main");

    const runSearch = async () => {
      h.load("");
      // Just right of the search strip, level with the search box.
      const sr = search?.getBoundingClientRect();
      const c = h.canvasRect();
      if (sr && c) placeAt(c.left + 24, sr.top);
      for (;;) {
        h.setQuery("");
        const r = search?.getBoundingClientRect();
        if (!r) return;
        const textX = r.left + 12;
        const y = r.top + r.height / 2;
        await move(textX + 30, y, 700);
        shape(BEAM);
        await move(textX, y, 150);
        await click();
        search?.classList.add("demo-focus");
        let q = "";
        for (const ch of QUERY) {
          q += ch;
          h.setQuery(q);
          await move(textX + q.length * CHAR_WIDTH, y, 90);
        }
        await wait(2200);
        search?.classList.remove("demo-focus");
        shape(DOT);
        const p = canvasPoint(200, 200);
        await move(p.x, p.y, 700);
        await wait(700);
      }
    };

    const runDrag = async () => {
      h.setQuery(QUERY);
      h.load(hatXml(wsPoint(scriptAt)));
      // Beside the script being built.
      placeAt(scriptBox.right + 16, scriptAt.y - 10);
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
      // Under the Copy PNG button, below where its toast drops in.
      const btn = copyBtn?.parentElement?.getBoundingClientRect();
      if (btn) placeAt(btn.right - size().w, btn.bottom + 110);
      await wait(300);
      for (;;) {
        const r = copyBtn?.getBoundingClientRect();
        if (!r) return;
        await move(r.left + r.width / 2, r.top + r.height / 2, 900);
        shape(padOver(r));
        await wait(350);
        copyBtn?.classList.add("demo-press");
        await click();
        copyBtn?.classList.remove("demo-press");
        await h.copy();
        await wait(2200);
        shape(DOT);
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
      setCursor((c) => ({ ...c, pressed: false, shape: DOT }));
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
    window.setTimeout(onClosed, COLLAPSE_MS);
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
        className={`tutorial${phase === "open" ? "" : " folded"}${phase === "closing" || expanding ? " slow" : ""}`}
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
        >
          <div
            className={`fake-cursor-shape ${cursor.shape.kind}`}
            style={{
              width: cursor.shape.w,
              height: cursor.shape.h,
              borderRadius: cursor.shape.r,
            }}
          />
        </div>
      )}
    </>
  );
}

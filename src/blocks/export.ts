import * as SB from "scratch-blocks";
import { trim } from "../render";

const PAD = 4;

const STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linejoin",
  "stroke-linecap",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "dominant-baseline",
  "text-anchor",
  "visibility",
  "display",
];

// Copy computed styles onto the clone so the SVG renders the same outside
// the page's stylesheets.
export function inlineStyles(src: Element, dst: Element) {
  const computed = getComputedStyle(src);
  const css = STYLE_PROPS.map(
    (p) => `${p}:${computed.getPropertyValue(p)}`,
  ).join(";");
  dst.setAttribute("style", css);
  for (let i = 0; i < src.children.length; i++) {
    const s = src.children[i];
    const d = dst.children[i];
    if (s && d) inlineStyles(s, d);
  }
}

async function toDataUri(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function inlineImages(root: Element) {
  const images = Array.from(root.querySelectorAll("image"));
  await Promise.all(
    images.map(async (img) => {
      const href =
        img.getAttribute("href") ??
        img.getAttributeNS("http://www.w3.org/1999/xlink", "href");
      if (!href) return;
      const uri = await toDataUri(new URL(href, location.href).href);
      img.setAttribute("href", uri);
      img.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
    }),
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not rasterise workspace"));
    img.src = src;
  });
}

// Drop the selection outline without going through the focus manager,
// which rejects a null selection.
function unselect() {
  const selected = SB.common.getSelected() as { unselect?: () => void } | null;
  selected?.unselect?.();
}

// Clone `source` into a standalone SVG framing `box`. Styles are copied
// now, so the caller can undo any temporary changes to the live DOM.
function standaloneSvg(
  workspace: SB.WorkspaceSvg,
  source: SVGGElement,
  box: DOMRect,
  scale: number,
) {
  const clone = source.cloneNode(true) as SVGGElement;
  inlineStyles(source, clone);
  clone.removeAttribute("transform");

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const w = box.width + PAD * 2;
  const h = box.height + PAD * 2;
  svg.setAttribute("width", String(w * scale));
  svg.setAttribute("height", String(h * scale));
  svg.setAttribute("viewBox", `${box.x - PAD} ${box.y - PAD} ${w} ${h}`);
  // Filters such as the selection glow reference defs in the live SVG.
  const defs = workspace.getParentSvg().querySelector("defs");
  if (defs) svg.appendChild(defs.cloneNode(true));
  svg.appendChild(clone);
  return { svg, clone, width: Math.ceil(w * scale), height: Math.ceil(h * scale) };
}

async function rasterise(
  { svg, clone, width, height }: ReturnType<typeof standaloneSvg>,
): Promise<Blob> {
  await inlineImages(clone);
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(
    new Blob([xml], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const img = await loadImage(url);
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    out.getContext("2d")?.drawImage(img, 0, 0, width, height);
    const trimmed = trim(out);
    return await new Promise<Blob>((resolve, reject) =>
      trimmed.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PNG encode failed"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function workspacePng(
  workspace: SB.WorkspaceSvg,
  scale: number,
): Promise<Blob> {
  unselect();
  const canvas = workspace.getCanvas();
  const box = canvas.getBBox();
  if (box.width === 0 || box.height === 0) throw new Error("Nothing to copy");
  return rasterise(standaloneSvg(workspace, canvas, box, scale));
}

// The blocks that go with `block` the way Delete counts them: the block and
// everything nested in it, but not the blocks stacked below it.
export function blocksWith(block: SB.Block): SB.Block[] {
  const below = block.getNextBlock()?.getDescendants(false) ?? [];
  return block
    .getDescendants(false)
    .filter((b) => !b.isShadow() && !below.includes(b));
}

export async function blockPng(block: SB.BlockSvg, scale: number): Promise<Blob> {
  unselect();
  const root = block.getSvgRoot();
  // The next block's SVG is nested inside this one; hide it while measuring
  // and cloning so only this block and its insides are drawn.
  const next = block.getNextBlock() as SB.BlockSvg | null;
  const nextRoot = next?.getSvgRoot();
  const display = nextRoot?.style.display ?? "";
  if (nextRoot) nextRoot.style.display = "none";
  let standalone: ReturnType<typeof standaloneSvg>;
  try {
    standalone = standaloneSvg(block.workspace, root, root.getBBox(), scale);
  } finally {
    if (nextRoot) nextRoot.style.display = display;
  }
  return rasterise(standalone);
}

// Write a PNG that is still rendering. Chrome reports any render failure as
// a generic DataError, so keep the real one to rethrow.
async function writePng(png: Promise<Blob>): Promise<Blob> {
  let failure: unknown;
  const tracked = png.catch((e: unknown) => {
    failure = e;
    throw e;
  });
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": tracked })]);
  } catch (e) {
    throw failure ?? e;
  }
  return tracked;
}

export function copyBlock(block: SB.BlockSvg, scale: number): Promise<Blob> {
  return writePng(blockPng(block, scale));
}

export function isEmpty(workspace: SB.WorkspaceSvg): boolean {
  return (
    workspace.getTopBlocks(false).length === 0 &&
    workspace.getTopComments(false).length === 0
  );
}

// Output size before trimming, which can shave a few pixels off.
export function estimateSize(
  workspace: SB.WorkspaceSvg,
  scale: number,
): [number, number] {
  if (isEmpty(workspace)) return [0, 0];
  const box = workspace.getCanvas().getBBox();
  if (box.width === 0 || box.height === 0) return [0, 0];
  return [
    Math.ceil((box.width + PAD * 2) * scale),
    Math.ceil((box.height + PAD * 2) * scale),
  ];
}

export function copyWorkspace(
  workspace: SB.WorkspaceSvg,
  scale: number,
): Promise<Blob> {
  return writePng(workspacePng(workspace, scale));
}

export async function downloadWorkspace(
  workspace: SB.WorkspaceSvg,
  scale: number,
  fileName: string,
): Promise<Blob> {
  const png = await workspacePng(workspace, scale);
  const url = URL.createObjectURL(png);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return png;
}

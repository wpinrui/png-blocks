import scratchblocks from "scratchblocks";

const STYLE = "scratch3";

function view(code: string, scale: number) {
  const doc = scratchblocks.parse(code, { languages: ["en"] });
  const v = scratchblocks.newView(doc, { style: STYLE, scale });
  const svg = v.render();
  svg.classList.add(`scratchblocks-style-${STYLE}`);
  return { v, svg };
}

export function renderSvg(code: string, scale: number): SVGSVGElement {
  return view(code, scale).svg;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not rasterise block SVG"));
    img.src = src;
  });
}

// Crop the canvas to the bounding box of its non-transparent pixels.
function trim(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) > 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return canvas;
  const out = document.createElement("canvas");
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out.getContext("2d")?.drawImage(canvas, -left, -top);
  return out;
}

export async function renderPng(code: string, scale: number): Promise<Blob> {
  const { v } = view(code, scale);
  const xml = v.exportSVGString();
  const url = URL.createObjectURL(
    new Blob([xml], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(v.width * scale));
    canvas.height = Math.max(1, Math.ceil(v.height * scale));
    canvas.getContext("2d")?.drawImage(img, 0, 0);
    const trimmed = trim(canvas);
    return await new Promise<Blob>((resolve, reject) =>
      trimmed.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function copyPng(code: string, scale: number): Promise<void> {
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": renderPng(code, scale) }),
  ]);
}

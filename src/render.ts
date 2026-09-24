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

// Crop the canvas to the bounding box of its non-transparent pixels.
export function trim(canvas: HTMLCanvasElement): HTMLCanvasElement {
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

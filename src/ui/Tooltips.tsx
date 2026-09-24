import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Tip = { text: string; x: number; y: number; below: boolean };

// One app-wide tooltip for any element with data-tip. Unlike the native
// title tooltip it shows immediately.
export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current: Element | null = null;
    const hide = () => {
      current = null;
      setTip(null);
    };
    const over = (e: MouseEvent) => {
      const el =
        e.target instanceof Element ? e.target.closest("[data-tip]") : null;
      if (el === current) return;
      current = el;
      const text = el?.getAttribute("data-tip");
      if (!el || !text) {
        setTip(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const below = r.bottom + 44 < window.innerHeight;
      setTip({
        text,
        x: r.left + r.width / 2,
        y: below ? r.bottom + 6 : r.top - 6,
        below,
      });
    };
    const out = (e: MouseEvent) => {
      if (!e.relatedTarget) hide();
    };
    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("mousedown", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("mousedown", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Centre on the target, kept inside the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !tip) return;
    const w = el.offsetWidth;
    const left = Math.max(8, Math.min(tip.x - w / 2, window.innerWidth - w - 8));
    el.style.left = `${left}px`;
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={ref}
      className="tooltip"
      role="tooltip"
      style={{
        top: tip.y,
        transform: tip.below ? undefined : "translateY(-100%)",
      }}
    >
      {tip.text}
    </div>
  );
}

import { useEffect, useRef } from 'react';

// A marker layer over a generated frame (Stage 5): the user draws bright
// strokes over the areas to change; the strokes live as a transparent PNG at
// the image's natural size (project.shotMarkups) and are merged into the
// picture only when Tweak sends it to the image model. Inactive, the layer
// lets every click through to the image.
export const MARK_COLOR = 'rgba(255, 45, 215, 0.92)';
export const MARK_COLOR_NAME = 'magenta';

export default function MarkupCanvas({ src, value = '', active = false, onChange }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const emitted = useRef(''); // the PNG this layer produced last (no repaint for it)

  const paint = (png) => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (!png) return;
    const im = new Image();
    im.onload = () => {
      if (ref.current === c) ctx.drawImage(im, 0, 0, c.width, c.height);
    };
    im.src = png;
  };

  // the canvas takes the image's natural size, so strokes keep their place
  // whatever the display size
  useEffect(() => {
    let alive = true;
    const im = new Image();
    im.onload = () => {
      const c = ref.current;
      if (!alive || !c) return;
      c.width = im.naturalWidth || c.width;
      c.height = im.naturalHeight || c.height;
      paint(value);
    };
    im.src = src;
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    paint(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const pos = (e) => {
    const c = ref.current;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / Math.max(1, r.width), y: ((e.clientY - r.top) * c.height) / Math.max(1, r.height) };
  };
  const stroke = (ctx, c) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = MARK_COLOR;
    ctx.lineWidth = Math.max(8, Math.round(c.width * 0.03));
  };
  const down = (e) => {
    if (!active || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    const c = ref.current;
    try {
      c.setPointerCapture(e.pointerId);
    } catch {
      /* best-effort */
    }
    drawing.current = true;
    last.current = pos(e);
    const ctx = c.getContext('2d');
    stroke(ctx, c);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(last.current.x + 0.1, last.current.y);
    ctx.stroke();
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const c = ref.current;
    const ctx = c.getContext('2d');
    const p = pos(e);
    stroke(ctx, c);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const up = (e) => {
    if (!drawing.current) return;
    drawing.current = false;
    const c = ref.current;
    try {
      c.releasePointerCapture(e.pointerId);
    } catch {
      /* released */
    }
    const png = c.toDataURL('image/png');
    emitted.current = png;
    onChange?.(png);
  };

  return (
    <canvas
      ref={ref}
      className={`markup-canvas ${active ? 'active' : ''}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={(e) => active && e.stopPropagation()}
    />
  );
}

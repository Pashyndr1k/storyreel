import { useLayoutEffect, useRef } from 'react';

// A textarea whose height grows to fit its content, so long text never scrolls.
// `remeasure` is any value whose change should force a re-measure — e.g. a
// parent's collapsed/expanded flag, since a textarea measured while hidden
// (display:none) reads a height of zero.
export default function AutoTextarea({ value, minRows = 2, className = '', remeasure, ...props }) {
  const ref = useRef(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  // Recompute on value change (typing and programmatic updates alike).
  useLayoutEffect(resize, [value, remeasure]);

  // …and whenever the box's width changes: the compact workbench card folds
  // the editor away (display:none measures as 0) and lays it out at a
  // different width than the full card, so a height computed then is stale.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let lastW = -1;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? el.clientWidth;
      if (w !== lastW) {
        lastW = w;
        if (w > 0) resize();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      className={`auto-ta ${className}`.trim()}
      value={value}
      rows={minRows}
      onInput={resize}
      {...props}
    />
  );
}

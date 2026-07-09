import { useLayoutEffect, useRef } from 'react';

// A textarea whose height grows to fit its content, so long text never scrolls.
export default function AutoTextarea({ value, minRows = 2, className = '', ...props }) {
  const ref = useRef(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  // Recompute on value change (typing and programmatic updates alike).
  useLayoutEffect(resize, [value]);

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

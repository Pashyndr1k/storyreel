import { useLayoutEffect, useMemo, useRef } from 'react';
import { highlightPromptTokens } from '../lib/promptHighlight.js';

// An auto-growing textarea that shows subtle structural coloring of a generation
// prompt. The textarea itself renders transparent text (but a visible caret) on
// top of a mirror <div> that carries the colored spans — the classic
// highlighted-textarea overlay, so editing stays fully native while the color
// tracks the text. The two layers share identical box metrics (see .ht-* CSS)
// so the colored text sits exactly under the real glyphs.
export default function HighlightedTextarea({ value, names = [], minRows = 3, className = '', ...props }) {
  const taRef = useRef(null);
  const backRef = useRef(null);

  const resize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    if (backRef.current) backRef.current.scrollTop = el.scrollTop;
  };
  useLayoutEffect(resize, [value]);

  const tokens = useMemo(() => highlightPromptTokens(value || '', names), [value, names]);

  return (
    <div className={`ht-wrap ${className}`.trim()}>
      <div className="ht-backdrop" ref={backRef} aria-hidden="true">
        {tokens.map((tk, i) =>
          tk.cat ? (
            <span key={i} className={`ph-${tk.cat}`}>
              {tk.text}
            </span>
          ) : (
            <span key={i}>{tk.text}</span>
          )
        )}
        {/* keep a trailing line so a final newline isn't collapsed */}
        {'​'}
      </div>
      <textarea
        ref={taRef}
        className="auto-ta ht-input"
        value={value}
        rows={minRows}
        onInput={resize}
        onScroll={() => backRef.current && (backRef.current.scrollTop = taRef.current.scrollTop)}
        spellCheck={false}
        {...props}
      />
    </div>
  );
}

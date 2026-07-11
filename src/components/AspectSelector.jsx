import { ASPECT_RATIOS } from '../lib/aspect.js';

// Icon row of aspect-ratio choices; each glyph is a rectangle proportioned to
// the ratio, with the label beneath (see reference design).
export default function AspectSelector({ value, onChange }) {
  const MAX = 22;
  return (
    <div className="aspect-row" role="group" aria-label="Aspect ratio">
      {ASPECT_RATIOS.map((a) => {
        const w = a.w >= a.h ? MAX : (MAX * a.w) / a.h;
        const h = a.h >= a.w ? MAX : (MAX * a.h) / a.w;
        return (
          <button
            type="button"
            key={a.value}
            className={`aspect-cell ${value === a.value ? 'selected' : ''}`}
            aria-pressed={value === a.value}
            title={a.value}
            onClick={() => onChange(a.value)}
          >
            <span className="aspect-glyph">
              <span className="aspect-box" style={{ width: `${w}px`, height: `${h}px` }} />
            </span>
            <span className="aspect-label">{a.value}</span>
          </button>
        );
      })}
    </div>
  );
}

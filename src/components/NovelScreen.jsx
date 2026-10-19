import { memo, useRef, useState } from 'react';
import {
  SCREEN_W, SCREEN_H, STROKE, COMIC_FONT_FAMILY, DIALOGUE_SIZE, CAPTION_SIZE, CAPTION_LINE,
  screenPanels, placeBubbles, bubblePath, bubbleLineY, captionLines,
} from '../lib/novel/layout.js';
import { visiblePanels } from '../lib/novel/model.js';
import { CAPTION_BG, PAPER, INK, EMPTY_PANEL } from '../lib/novel/render.js';

// One comic screen (9:16) drawn as SVG in screen units, so the dialogue font
// keeps one size on every screen and the export (lib/novel/render.js) draws
// exactly this. `editable`: panels can be selected and balloons dragged
// (onMoveBubble gets the new top-left corner as fractions of the image box).
function NovelScreen({ screen, images, width = 300, editable = false, selected = -1, onSelectPanel, onMoveBubble, emptyLabel, idPrefix = 'ns' }) {
  const svgRef = useRef(null);
  const [drag, setDragState] = useState(null); // { panel, id, dx, dy, x, y }
  // the handlers read the ref: pointer events can outrun a re-render
  const dragRef = useRef(null);
  const setDrag = (d) => {
    dragRef.current = d;
    setDragState(d);
  };
  const boxes = screenPanels(screen.layout);
  const panels = visiblePanels(screen);

  const toSvg = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };

  return (
    <svg
      ref={svgRef}
      className={`novel-screen${editable ? ' editable' : ''}`}
      viewBox={`0 0 ${SCREEN_W} ${SCREEN_H}`}
      width={width}
      height={(width * SCREEN_H) / SCREEN_W}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d) return;
        const p = toSvg(e);
        setDrag({ ...d, x: p.x - d.dx, y: p.y - d.dy });
      }}
      onPointerUp={() => {
        const d = dragRef.current;
        if (!d) return;
        const b = boxes[d.panel];
        onMoveBubble?.(d.panel, d.id, (d.x - b.x) / b.w, (d.y - b.y) / b.h);
        setDrag(null);
      }}
    >
      <rect x="0" y="0" width={SCREEN_W} height={SCREEN_H} fill={PAPER} />
      {boxes.map((b, i) => {
        const p = panels[i];
        const img = images?.[p.id];
        const clip = `${idPrefix}-${p.id}-clip`;
        const bubbles = placeBubbles(
          b,
          (p.bubbles || []).map((bb) => (drag && drag.panel === i && drag.id === bb.id ? { ...bb, x: (drag.x - b.x) / b.w, y: (drag.y - b.y) / b.h } : bb))
        );
        const cap = captionLines(p.caption, b.cap.w);
        const capTop = b.cap.y + (b.cap.h - cap.lines.length * CAPTION_LINE) / 2 + CAPTION_SIZE * 0.85;
        return (
          <g key={p.id} className={`ns-panel${selected === i ? ' sel' : ''}`} onClick={() => onSelectPanel?.(i)}>
            <defs>
              <clipPath id={clip}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clip})`}>
              {img ? (
                <image href={img} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="xMidYMid slice" />
              ) : (
                <>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={EMPTY_PANEL} />
                  {emptyLabel && (
                    <text x={b.x + b.w / 2} y={b.y + b.h / 2} textAnchor="middle" fontSize="40" fill="#9b978d" fontFamily="system-ui, sans-serif">
                      {emptyLabel(i)}
                    </text>
                  )}
                </>
              )}
              {bubbles.map((bb) => (
                <g
                  key={bb.id}
                  className="ns-bubble"
                  onPointerDown={
                    editable
                      ? (e) => {
                          e.stopPropagation();
                          try {
                            e.currentTarget.ownerSVGElement.setPointerCapture(e.pointerId);
                          } catch {
                            /* capture is a nicety: the move/up handlers sit on the svg */
                          }
                          const pt = toSvg(e);
                          setDrag({ panel: i, id: bb.id, dx: pt.x - bb.x, dy: pt.y - bb.y, x: bb.x, y: bb.y });
                          onSelectPanel?.(i);
                        }
                      : undefined
                  }
                >
                  <path d={bubblePath(bb)} fill={PAPER} stroke={INK} strokeWidth={STROKE - 1} strokeLinejoin="round" />
                  {bb.lines.map((line, k) => (
                    <text key={k} x={bb.x + bb.w / 2} y={bubbleLineY(bb, k)} textAnchor="middle" fontSize={DIALOGUE_SIZE} fill={INK} fontFamily={COMIC_FONT_FAMILY}>
                      {line}
                    </text>
                  ))}
                </g>
              ))}
            </g>
            <rect x={b.cap.x} y={b.cap.y} width={b.cap.w} height={b.cap.h} fill={CAPTION_BG} />
            {cap.lines.map((line, k) => (
              <text key={k} x={b.cap.x + 16} y={capTop + k * CAPTION_LINE} fontSize={CAPTION_SIZE} fill={INK} fontFamily={COMIC_FONT_FAMILY}>
                {line}
              </text>
            ))}
            <rect x={b.x} y={b.y} width={b.w} height={b.h + b.cap.h} fill="none" stroke={INK} strokeWidth={STROKE} />
            <line x1={b.cap.x} y1={b.cap.y} x2={b.cap.x + b.cap.w} y2={b.cap.y} stroke={INK} strokeWidth={STROKE - 2} />
            {editable && selected === i && <rect className="ns-sel" x={b.x - 10} y={b.y - 10} width={b.w + 20} height={b.h + b.cap.h + 20} fill="none" />}
          </g>
        );
      })}
    </svg>
  );
}

export default memo(NovelScreen);

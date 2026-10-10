import { useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { SUB_FONTS, SUB_POSITIONS, subStyleOf, subPlacement } from '../lib/subtitles.js';
import { aspectValue } from '../lib/spatial/layout.js';

// One subtitle block (double-click it on the timeline): a preview of the text
// over the shot's first frame (click the frame to place custom text), and the
// block's text, timing and look — font, size, colour, placement (bottom /
// centre / top, or anywhere). "Use for all" makes the look the layer's
// default. `subs` is project.subtitles; `item` the block; `frame` a data URL
// (or null); `aspect` the project's aspect ratio ("16:9").
const r2 = (n) => Math.round(n * 100) / 100;

export default function SubtitleModal({ subs, item, frame = null, aspect = '16:9', onSave, onDelete, onClose }) {
  const { t } = useI18n();
  const base = subStyleOf(subs, item);
  const [text, setText] = useState(item.text || '');
  const [start, setStart] = useState(r2(item.start || 0));
  const [duration, setDuration] = useState(r2(item.duration || 2));
  const [font, setFont] = useState(base.font);
  const [size, setSize] = useState(base.size);
  const [color, setColor] = useState(base.color);
  const [outline, setOutline] = useState(base.outline);
  const [position, setPosition] = useState(item.custom ? 'custom' : base.position);
  const [x, setX] = useState(Number.isFinite(Number(item.x)) ? item.x : 50);
  const [y, setY] = useState(Number.isFinite(Number(item.y)) ? item.y : 88);
  const [forAll, setForAll] = useState(false);
  const boxRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draft = { ...item, custom: position === 'custom', x: Number(x), y: Number(y), style: { font, size: Number(size) || base.size, color, outline, position } };
  const st = subStyleOf(subs, draft);
  const pl = subPlacement(subs, draft);
  const fs = (st.size / 100) * box.h;
  const tx = pl.align === 'left' ? '0' : pl.align === 'right' ? '-100%' : '-50%';
  const ty = pl.vertical === 'top' ? '0' : pl.vertical === 'middle' ? '-50%' : '-100%';

  // a click on the frame places custom text there
  const place = (e) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    setPosition('custom');
    setX(Math.round(((e.clientX - r.left) / r.width) * 100));
    setY(Math.round(((e.clientY - r.top) / r.height) * 100));
  };

  const save = () => {
    if (!text.trim()) return;
    onSave({ ...draft, text: text.trim(), start: Math.max(0, Number(start) || 0), duration: Math.max(0.2, Number(duration) || 0.2) }, { forAll });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal sub-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('sub.edit')}>
        <div className="modal-head-row">
          <h2 title={t('sub.editTip')}>{t('sub.edit')}</h2>
          <button type="button" className="modal-x" title={t('tip.close')} aria-label={t('tip.close')} onClick={onClose}>✕</button>
        </div>
        <div className="sub-edit">
          {/* where the text sits over the picture */}
          <div className="sub-preview" ref={boxRef} style={{ aspectRatio: String(aspectValue(aspect)) }} title={t('sub.previewTip')} onClick={place}>
            {frame ? <img src={frame} alt="" draggable={false} /> : <div className="sub-preview-empty">{t('sub.noFrame')}</div>}
            {box.h > 0 && text.trim() && (
              <div
                className={`sub-text ${pl.custom ? '' : 'sub-text-band'}`}
                style={{ left: `${pl.x * 100}%`, top: `${pl.y * 100}%`, transform: `translate(${tx}, ${ty})`, fontFamily: `"${st.font}", Arial, sans-serif`, fontSize: fs, color: st.color, WebkitTextStroke: `${Math.max(0.5, fs / 18)}px ${st.outline}`, textShadow: `0 0 ${Math.max(2, fs / 10)}px ${st.outline}`, textAlign: pl.align }}
              >
                {text.trim()}
              </div>
            )}
          </div>

          <div className="sub-fields">
            <textarea rows={2} value={text} title={t('sub.textTip')} placeholder={t('sub.text')} onChange={(e) => setText(e.target.value)} />
            <div className="sub-row">
              <label title={t('sub.startTip')}>
                <span>{t('sub.start')}</span>
                <input type="number" step="0.1" min="0" value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label title={t('sub.durationTip')}>
                <span>{t('sub.duration')}</span>
                <input type="number" step="0.1" min="0.2" max="60" value={duration} onChange={(e) => setDuration(e.target.value)} />
              </label>
            </div>
            <div className="sub-row">
              <label className="grow" title={t('sub.fontTip')}>
                <span>{t('sub.font')}</span>
                <select value={font} onChange={(e) => setFont(e.target.value)}>
                  {SUB_FONTS.map((f) => (
                    <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                  ))}
                </select>
              </label>
              <label title={t('sub.sizeTip')}>
                <span>{t('sub.size')}</span>
                <input type="number" step="0.2" min="1.5" max="14" value={size} onChange={(e) => setSize(e.target.value)} />
              </label>
            </div>
            <div className="sub-row">
              <label className="grow" title={t('sub.positionTip')}>
                <span>{t('sub.position')}</span>
                <select value={position} onChange={(e) => setPosition(e.target.value)}>
                  {SUB_POSITIONS.map((p) => (
                    <option key={p} value={p}>{t(`sub.pos_${p}`)}</option>
                  ))}
                </select>
              </label>
              <label title={t('sub.colorTip')}>
                <span>{t('sub.color')}</span>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </label>
              <label title={t('sub.outlineTip')}>
                <span>{t('sub.outline')}</span>
                <input type="color" value={outline} onChange={(e) => setOutline(e.target.value)} />
              </label>
            </div>
            {position === 'custom' && (
              <div className="sub-row">
                <label title={t('sub.xTip')}>
                  <span>{t('sub.x')}</span>
                  <input type="number" min="0" max="100" value={x} onChange={(e) => setX(e.target.value)} />
                </label>
                <label title={t('sub.yTip')}>
                  <span>{t('sub.y')}</span>
                  <input type="number" min="0" max="100" value={y} onChange={(e) => setY(e.target.value)} />
                </label>
                <span className="hint grow">{t('sub.clickHint')}</span>
              </div>
            )}
            <label className="check-row" title={t('sub.forAllTip')}>
              <input type="checkbox" checked={forAll} onChange={(e) => setForAll(e.target.checked)} /> {t('sub.forAll')}
            </label>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn small danger" title={t('sub.deleteTip')} onClick={() => onDelete(item.id)}>{t('sub.delete')}</button>
          <span className="grow" />
          <button type="button" className="btn" title={t('tip.cancel')} onClick={onClose}>{t('new.cancel')}</button>
          <button type="button" className="btn primary" title={t('sub.saveTip')} disabled={!text.trim()} onClick={save}>{t('sub.save')}</button>
        </div>
      </div>
    </div>
  );
}

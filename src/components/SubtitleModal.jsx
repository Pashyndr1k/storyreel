import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { SUB_FONTS, SUB_POSITIONS, subStyleOf } from '../lib/subtitles.js';

// One subtitle block (double-click it on the timeline): its text and timing,
// and its look — font, size, colour, placement (bottom / centre / top, or a
// free position anywhere on the frame). "Use for all" makes the look the
// layer's default. `subs` is project.subtitles; `item` the block.
const r2 = (n) => Math.round(n * 100) / 100;

export default function SubtitleModal({ subs, item, onSave, onDelete, onClose }) {
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

  const save = () => {
    if (!text.trim()) return;
    const style = { font, size: Number(size) || base.size, color, outline, position };
    const next = {
      ...item,
      text: text.trim(),
      start: Math.max(0, Number(start) || 0),
      duration: Math.max(0.2, Number(duration) || 0.2),
      custom: position === 'custom',
      ...(position === 'custom' ? { x: Number(x), y: Number(y) } : {}),
      style,
    };
    onSave(next, { forAll });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal sub-modal" onClick={(e) => e.stopPropagation()}>
        <h2 title={t('sub.editTip')}>{t('sub.edit')}</h2>

        <label htmlFor="sub-text">{t('sub.text')}</label>
        <textarea id="sub-text" rows={3} value={text} title={t('sub.textTip')} onChange={(e) => setText(e.target.value)} />

        <div className="row sub-row">
          <div className="grow">
            <label htmlFor="sub-start">{t('sub.start')}</label>
            <input id="sub-start" type="number" step="0.1" min="0" value={start} title={t('sub.startTip')} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="grow">
            <label htmlFor="sub-dur">{t('sub.duration')}</label>
            <input id="sub-dur" type="number" step="0.1" min="0.2" max="60" value={duration} title={t('sub.durationTip')} onChange={(e) => setDuration(e.target.value)} />
          </div>
        </div>

        <div className="row sub-row">
          <div className="grow">
            <label htmlFor="sub-font">{t('sub.font')}</label>
            <select id="sub-font" value={font} title={t('sub.fontTip')} onChange={(e) => setFont(e.target.value)}>
              {SUB_FONTS.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sub-size">{t('sub.size')}</label>
            <input id="sub-size" type="number" step="0.2" min="1.5" max="14" value={size} title={t('sub.sizeTip')} onChange={(e) => setSize(e.target.value)} />
          </div>
          <div>
            <label htmlFor="sub-color">{t('sub.color')}</label>
            <input id="sub-color" type="color" value={color} title={t('sub.colorTip')} onChange={(e) => setColor(e.target.value)} />
          </div>
          <div>
            <label htmlFor="sub-outline">{t('sub.outline')}</label>
            <input id="sub-outline" type="color" value={outline} title={t('sub.outlineTip')} onChange={(e) => setOutline(e.target.value)} />
          </div>
        </div>

        <div className="row sub-row">
          <div className="grow">
            <label htmlFor="sub-pos">{t('sub.position')}</label>
            <select id="sub-pos" value={position} title={t('sub.positionTip')} onChange={(e) => setPosition(e.target.value)}>
              {SUB_POSITIONS.map((p) => (
                <option key={p} value={p}>{t(`sub.pos_${p}`)}</option>
              ))}
            </select>
          </div>
          {position === 'custom' && (
            <>
              <div>
                <label htmlFor="sub-x">{t('sub.x')}</label>
                <input id="sub-x" type="number" min="0" max="100" value={x} title={t('sub.xTip')} onChange={(e) => setX(e.target.value)} />
              </div>
              <div>
                <label htmlFor="sub-y">{t('sub.y')}</label>
                <input id="sub-y" type="number" min="0" max="100" value={y} title={t('sub.yTip')} onChange={(e) => setY(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <div className="sub-sample" style={{ fontFamily: font, color, WebkitTextStroke: `0.6px ${outline}`, textShadow: `0 0 3px ${outline}` }} title={t('sub.sampleTip')}>
          {text.trim() || t('sub.sample')}
        </div>

        <label className="check-row" title={t('sub.forAllTip')}>
          <input type="checkbox" checked={forAll} onChange={(e) => setForAll(e.target.checked)} /> {t('sub.forAll')}
        </label>

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

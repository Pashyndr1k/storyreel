import { useI18n } from '../lib/i18n.js';
import { EXTENDED_SHOT_MAX_SEC } from '../lib/config.js';

// Asked before a shot breakdown: ordinary shots (one camera set-up each,
// 2–10 s) or extended shots — complex shots of up to 15 s that change the
// camera two or three times inside one generation. `value` is the project's
// current choice; `onPick(mode)` runs the breakdown.
export default function BreakdownModeModal({ value = 'normal', scope = 'scene', onPick, onClose }) {
  const { t } = useI18n();
  const opts = [
    { v: 'normal', title: t('s4.modeNormal'), hint: t('s4.modeNormalHint') },
    { v: 'extended', title: t('s4.modeExtended', { s: EXTENDED_SHOT_MAX_SEC }), hint: t('s4.modeExtendedHint') },
  ];
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal bmode-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('s4.modeTitle')}>
        <div className="modal-head-row">
          <h2 title={t('s4.modeTip')}>{t('s4.modeTitle')}</h2>
          <button type="button" className="modal-x" title={t('tip.close')} aria-label={t('tip.close')} onClick={onClose}>✕</button>
        </div>
        <p className="hint">{scope === 'all' ? t('s4.modeScopeAll') : t('s4.modeScopeScene')}</p>
        <div className="render-options">
          {opts.map((o) => (
            <button key={o.v} type="button" className={`render-opt bmode-opt ${value === o.v ? 'on' : ''}`} title={o.hint} onClick={() => onPick(o.v)}>
              <span className="render-opt-label">{o.title}</span>
              <span className="bmode-hint">{o.hint}</span>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" title={t('tip.cancel')} onClick={onClose}>{t('new.cancel')}</button>
        </div>
      </div>
    </div>
  );
}

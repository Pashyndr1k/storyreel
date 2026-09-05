import { useMemo } from 'react';
import { useI18n } from '../lib/i18n.js';
import { refCandidates, keyframesOf, seedTakeKeyframes, h3Stamp, H3_MFR_MAX_SECONDS } from '../lib/h3multi.js';
import { takeOf } from '../lib/takes.js';
import { Trash } from './icons.jsx';

// Keyframe editor for MiniMax H3 multi-frame mode. Each entry is a still (or
// an audio take) pinned to a second on the OUTPUT timeline. The shot's own
// first frame is always Picture 1 at 0 s and needs no entry; a take lead can
// seed its members' first frames at the take's cut times with one click.
export default function KeyframePicker({ project, shot, durationSec, onChange, onClose }) {
  const { t } = useI18n();
  // stored order for editing (rows must not jump while a time is typed);
  // <Picture N> numbers come from the time-sorted order the render uses
  const list = keyframesOf(project, shot.id, { sorted: false });
  const sortedImages = keyframesOf(project, shot.id).filter((k) => k.kind === 'image');
  const pictureNo = (src) => 2 + sortedImages.findIndex((k) => k.src === src);
  const cand = useMemo(() => refCandidates(project, shot, t), [project, shot, t]);
  const maxAt = Math.max(0.5, Math.min(H3_MFR_MAX_SECONDS, Number(durationSec) || H3_MFR_MAX_SECONDS) - 0.1);
  const take = takeOf(project, shot.id);
  const isLead = take && take.shotIds[0] === shot.id;

  const commit = (next) => onChange(next.map((k) => ({ ...k, at: Math.round(k.at * 100) / 100 })));
  const add = (kind, item) => {
    if (list.some((k) => k.src === item.src)) return;
    // default placement: after the last keyframe, inside the shot
    const last = list.length ? list[list.length - 1].at : 0;
    const at = Math.min(maxAt, Math.round((last + 1) * 2) / 2);
    commit([...list, { kind, src: item.src, label: item.label, at, ...(item.board ? { board: true } : {}) }]);
  };
  const setAt = (src, at) =>
    commit(list.map((k) => (k.src === src ? { ...k, at: Math.max(0, Math.min(maxAt, Number(at) || 0)) } : k)));
  const remove = (src) => commit(list.filter((k) => k.src !== src));
  const seed = () => commit(seedTakeKeyframes(project, take, t));

  const picked = (src) => list.some((k) => k.src === src);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide refpick-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head-row">
          <h3>{t('keys.title', { n: shot.number || '' })}</h3>
          <span className="total-badge">{t('keys.window', { s: maxAt.toFixed(1) })}</span>
        </div>
        <p className="hint">{t('keys.hint')}</p>

        <div className="s5e-eyebrow">{t('keys.current')}</div>
        {list.length === 0 ? (
          <p className="hint">{t('keys.empty')}</p>
        ) : (
          <div className="keylist">
            <div className="keyrow keyrow-first">
              <span className="keythumb keythumb-first">
                {(project.shotImages || {})[shot.id] ? (
                  <img src={(project.shotImages || {})[shot.id]} alt="" />
                ) : (
                  <i>1</i>
                )}
              </span>
              <span className="keylabel">
                <b>&lt;Picture 1&gt;</b> {t('keys.firstFrame')}
              </span>
              <span className="keyat mono">00:00.000</span>
            </div>
            {list.map((k) => (
              <div className="keyrow" key={k.src}>
                <span className="keythumb">
                  {k.kind === 'image' ? <img src={k.src} alt="" /> : <i>♪</i>}
                </span>
                <span className="keylabel">
                  {k.kind === 'image' && <b>&lt;Picture {pictureNo(k.src)}&gt;</b>}
                  {k.kind === 'audio' && <b>{t('keys.audioGuide')}</b>} {k.label}
                </span>
                <label className="keyat">
                  <input
                    type="number"
                    min="0"
                    max={maxAt}
                    step="0.1"
                    value={k.at}
                    onChange={(e) => setAt(k.src, e.target.value)}
                  />
                  <span className="mono">{h3Stamp(k.at)}</span>
                </label>
                <button type="button" className="s5e-ico" title={t('keys.remove')} aria-label={t('keys.remove')} onClick={() => remove(k.src)}>
                  <Trash size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {isLead && (
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn small" onClick={seed} title={t('keys.seedTip')}>
              {t('keys.seed')}
            </button>
          </div>
        )}

        <div className="refpick-sec">
          <div className="s5e-eyebrow">{t('keys.images')}</div>
          {cand.images.length === 0 ? (
            <p className="hint">{t('refs.none')}</p>
          ) : (
            <div className="refpick-grid">
              {cand.images.map((item, k) => (
                <button
                  key={`ki${k}`}
                  type="button"
                  className={`refpick-item ${picked(item.src) ? 'on' : ''}`}
                  title={item.label}
                  disabled={picked(item.src)}
                  onClick={() => add('image', item)}
                >
                  <img src={item.src} alt="" loading="lazy" decoding="async" />
                  <i>{item.label}</i>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="refpick-sec">
          <div className="s5e-eyebrow">{t('keys.audio')}</div>
          {cand.audios.length === 0 ? (
            <p className="hint">{t('refs.none')}</p>
          ) : (
            <div className="refpick-grid">
              {cand.audios.map((item, k) => (
                <button
                  key={`ka${k}`}
                  type="button"
                  className={`refpick-item ${picked(item.src) ? 'on' : ''}`}
                  title={item.label}
                  disabled={picked(item.src)}
                  onClick={() => add('audio', item)}
                >
                  <span className="refpick-aud">♪</span>
                  <i>{item.label}</i>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>
            {t('refs.done')}
          </button>
        </div>
      </div>
    </div>
  );
}

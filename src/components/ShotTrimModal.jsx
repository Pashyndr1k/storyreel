import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { SHOT_MIN_SEC, SHOT_MAX_SEC } from '../lib/config.js';
import { Play, Pause, SkipBack } from './icons.jsx';

// One shot in isolation (double-click a timeline clip): a small preview, its
// own transport, and a trim bar over the shot's SOURCE clip with an in- and an
// out-handle. `item` is the timeline item ({ shot, video, image, raw, trim,
// muted }); Apply reports { head, duration } — the in-point inside the source
// and the shot's new length. A shot without a video only has a length.
const STEP = 0.1;
const snap = (n) => Math.round(n / STEP) * STEP;
const fmt = (n) => `${(Math.round(n * 10) / 10).toFixed(1)}s`;

export default function ShotTrimModal({ item, index, locked = false, onApply, onClose }) {
  const { t } = useI18n();
  const hasVideo = !!item.video;
  const dur0 = Number(item.shot.duration) || SHOT_MIN_SEC;
  const head0 = hasVideo ? Number(item.trim?.head) || 0 : 0;
  // length of the source the bar represents: the real clip once its metadata
  // is known, else what the app recorded; an image has no source, only a slot
  const [len, setLen] = useState(hasVideo ? Math.max(Number(item.raw) || 0, head0 + dur0) : SHOT_MAX_SEC);
  const [inP, setInP] = useState(head0);
  const [outP, setOutP] = useState(head0 + dur0);
  const [cur, setCur] = useState(head0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const vRef = useRef(null);
  const barRef = useRef(null);
  const span = Math.max(len, outP, SHOT_MIN_SEC); // the bar always shows the whole selection

  // Escape closes; Space toggles playback
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const seek = (sec) => {
    const s = Math.max(0, Math.min(span, sec));
    setCur(s);
    const v = vRef.current;
    if (v) {
      try {
        v.currentTime = Math.min(s, Number.isFinite(v.duration) ? v.duration : s);
      } catch {
        /* not seekable yet */
      }
    }
  };

  // Follow playback; stop at the out-point and park on the in-point.
  useEffect(() => {
    if (!playing) return undefined;
    const v = vRef.current;
    if (!v) return undefined;
    let raf = 0;
    const loop = () => {
      const now = v.currentTime;
      if (now >= outP - 0.02 || v.ended) {
        v.pause();
        setPlaying(false);
        seek(inP);
        return;
      }
      setCur(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, outP, inP]);

  const play = (r) => {
    const v = vRef.current;
    if (!v) return;
    v.playbackRate = r;
    setRate(r);
    if (cur < inP - 0.01 || cur >= outP - 0.05) seek(inP);
    v.muted = !!item.muted;
    v.play().then(
      () => setPlaying(true),
      () => {
        v.muted = true;
        v.play().then(() => setPlaying(true), () => {});
      }
    );
  };
  const pause = () => {
    vRef.current?.pause();
    setPlaying(false);
  };

  // Handles: the in-point moves inside the source, the out-point ends the
  // shot; the length always stays inside the 2–10 s rule.
  const setIn = (sec) => {
    if (locked || !hasVideo) return;
    const v = Math.max(0, Math.min(snap(sec), outP - SHOT_MIN_SEC));
    const lo = Math.max(v, outP - SHOT_MAX_SEC);
    setInP(Math.round(lo * 10) / 10);
    seek(lo);
  };
  const setOut = (sec) => {
    if (locked) return;
    const hi = Math.min(snap(sec), inP + SHOT_MAX_SEC, hasVideo ? Math.max(len, inP + SHOT_MIN_SEC) : SHOT_MAX_SEC);
    const v = Math.max(inP + SHOT_MIN_SEC, hi);
    setOutP(Math.round(v * 10) / 10);
    seek(Math.max(inP, v - 0.05));
  };
  const secAt = (clientX) => {
    const r = barRef.current.getBoundingClientRect();
    return ((clientX - r.left) / Math.max(1, r.width)) * span;
  };
  const drag = (which) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    pause();
    const move = (ev) => (which === 'in' ? setIn(secAt(ev.clientX)) : which === 'out' ? setOut(secAt(ev.clientX)) : seek(secAt(ev.clientX)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    move(e);
  };
  const pct = (sec) => `${(Math.max(0, Math.min(span, sec)) / span) * 100}%`;
  const length = Math.round((outP - inP) * 10) / 10;
  const changed = Math.abs(inP - head0) > 0.001 || Math.abs(length - dur0) > 0.001;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal trim-modal" onClick={(e) => e.stopPropagation()}>
        <h2 title={t('tip.trimTitle')}>{t('trim.title', { n: index + 1 })}</h2>

        <div className="trim-view">
          {hasVideo ? (
            <video
              ref={vRef}
              src={item.video}
              preload="auto"
              playsInline
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) setLen(d);
                seek(inP);
              }}
              onPause={() => setPlaying(false)}
            />
          ) : item.image ? (
            <img src={item.image} alt="" />
          ) : (
            <div className="asm-blank">{t('s4.shot', { n: index + 1 })}</div>
          )}
        </div>

        {/* trim bar: the source clip, the kept part, both handles, the playhead */}
        <div className={`trim-bar ${locked ? 'locked' : ''}`} ref={barRef} onPointerDown={drag('seek')}>
          {hasVideo && outP > len + 0.01 && (
            <span className="trim-hold" style={{ left: pct(len), right: 0 }} title={t('trim.hold')} />
          )}
          <span className="trim-sel" style={{ left: pct(inP), width: `calc(${pct(outP)} - ${pct(inP)})` }} />
          {hasVideo && (
            <span className="trim-h in" style={{ left: pct(inP) }} title={t('trim.inTip')} onPointerDown={drag('in')} />
          )}
          <span className="trim-h out" style={{ left: pct(outP) }} title={t('trim.outTip')} onPointerDown={drag('out')} />
          {hasVideo && <span className="trim-ph" style={{ left: pct(cur) }} />}
        </div>

        <div className="trim-row">
          <span className="pv-ctrl trim-ctrl">
            <button type="button" title={t('trim.toIn')} aria-label={t('trim.toIn')} disabled={!hasVideo} onClick={() => { pause(); seek(inP); }}>
              <SkipBack size={14} />
            </button>
            <button type="button" className={playing && rate === 1 ? 'on' : ''} title={t('pv.play')} aria-label={t('pv.play')} disabled={!hasVideo} onClick={() => play(1)}>
              <Play size={14} />
            </button>
            <button type="button" className={`pv-slow ${playing && rate < 1 ? 'on' : ''}`} title={t('pv.slow')} aria-label={t('pv.slow')} disabled={!hasVideo} onClick={() => play(0.5)}>
              ½×
            </button>
            <button type="button" title={t('pv.pause')} aria-label={t('pv.pause')} disabled={!hasVideo} onClick={pause}>
              <Pause size={14} />
            </button>
          </span>
          <span className="trim-read">
            {hasVideo && (
              <span className="nle-nudge">
                {t('trim.in')}
                <button title={t('tip.inLess')} type="button" disabled={locked || inP <= 0} onClick={() => setIn(inP - STEP)}>−</button>
                <i className="trim-val">{fmt(inP)}</i>
                <button title={t('tip.inMore')} type="button" disabled={locked || outP - inP <= SHOT_MIN_SEC} onClick={() => setIn(inP + STEP)}>+</button>
              </span>
            )}
            <span className="nle-nudge">
              {t('trim.out')}
              <button title={t('tip.outLess')} type="button" disabled={locked || outP - inP <= SHOT_MIN_SEC} onClick={() => setOut(outP - STEP)}>−</button>
              <i className="trim-val">{fmt(outP)}</i>
              <button title={t('tip.outMore')} type="button" disabled={locked || outP - inP >= SHOT_MAX_SEC} onClick={() => setOut(outP + STEP)}>+</button>
            </span>
            <span className="trim-len" title={t('ind.trimLen')}>{t('trim.len')} <b>{fmt(length)}</b></span>
          </span>
        </div>
        {locked && <p className="hint">{t('trim.takeNote')}</p>}
        {!hasVideo && !locked && <p className="hint">{t('trim.noVideo')}</p>}

        <div className="modal-actions">
          <button title={t('tip.close')} className="btn small" onClick={onClose}>{t('s6.close')}</button>
          <button title={t('tip.trimApply')}
            className="btn small primary"
            disabled={locked || !changed}
            onClick={() => {
              onApply({ head: hasVideo ? inP : 0, duration: length });
              onClose();
            }}
          >
            {t('trim.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

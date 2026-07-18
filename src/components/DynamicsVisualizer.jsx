import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { ChartLine } from './icons.jsx';

// Action Dynamics Plan visualizer: a dual step-line graph over the film's
// runtime — violet for kinetic energy (motion), magenta for audio rhythm
// (dialogue/sound density). Hidden by default: stages 3–6 show only a small
// chart-icon button; clicking it opens the graph in a pop-up. Stage 6 passes
// `playhead` (seconds) to sync a cursor with the timeline.
const W = 720;
const H = 96;
const PAD_X = 34;
const PAD_Y = 10;

export default function DynamicsVisualizer({ plan, playhead = null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!plan?.rhythm_blocks?.length) return null;

  const blocks = plan.rhythm_blocks;
  const total = blocks.reduce((a, b) => Math.max(a, b.timestamp_start + b.intended_duration_sec), 0);
  if (total <= 0) return null;

  const x = (sec) => PAD_X + (sec / total) * (W - PAD_X * 2);
  const y = (level) => H - PAD_Y - ((level - 1) / 9) * (H - PAD_Y * 2);

  // Step-line path through the blocks for a given metric.
  const path = (key) => {
    let d = '';
    blocks.forEach((b, i) => {
      const x0 = x(b.timestamp_start);
      const x1 = x(b.timestamp_start + b.intended_duration_sec);
      const yy = y(b[key]);
      d += i === 0 ? `M ${x0} ${yy}` : ` L ${x0} ${yy}`;
      d += ` L ${x1} ${yy}`;
    });
    return d;
  };

  return (
    <>
      <button
        type="button"
        className="icon-btn dyn-btn"
        title={t('dyn.title')}
        aria-label={t('dyn.title')}
        onClick={() => setOpen(true)}
      >
        <ChartLine size={18} />
      </button>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal dyn-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-x" aria-label="close" onClick={() => setOpen(false)}>
              ✕
            </button>
            <h2>{t('dyn.title')}</h2>
            <p className="dyn-viz-meta">
              {t(`dyn.curve_${plan.global_pacing_curve}`)} · {blocks.length} {t('dyn.blocks')}
            </p>
            <div className="dyn-viz-body">
              <svg viewBox={`0 0 ${W} ${H + 18}`} preserveAspectRatio="none" aria-hidden="true">
                {[1, 5, 10].map((lv) => (
                  <g key={lv}>
                    <line x1={PAD_X} y1={y(lv)} x2={W - PAD_X} y2={y(lv)} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
                    <text x={PAD_X - 6} y={y(lv) + 3} textAnchor="end" fontSize="8" fill="#56516e">{lv}</text>
                  </g>
                ))}
                {blocks.map((b, i) => (
                  <g key={b.block_id}>
                    {i > 0 && (
                      <line x1={x(b.timestamp_start)} y1={PAD_Y} x2={x(b.timestamp_start)} y2={H - PAD_Y} stroke="rgba(255,255,255,0.1)" strokeDasharray="2 3" strokeWidth="1" />
                    )}
                    <text x={(x(b.timestamp_start) + x(b.timestamp_start + b.intended_duration_sec)) / 2} y={H + 12} textAnchor="middle" fontSize="8" fill="#8b87a0">
                      {b.block_id} · {b.shot_density}
                    </text>
                  </g>
                ))}
                <path d={path('kinetic_energy_level')} fill="none" stroke="#7c5cff" strokeWidth="2.5" strokeLinejoin="round" />
                <path d={path('dialogue_volume')} fill="none" stroke="#d946ef" strokeWidth="2" strokeDasharray="5 3" strokeLinejoin="round" />
                {playhead != null && playhead <= total && (
                  <line x1={x(playhead)} y1={PAD_Y - 4} x2={x(playhead)} y2={H - PAD_Y + 4} stroke="#ff5470" strokeWidth="1.5" />
                )}
              </svg>
              <div className="dyn-viz-legend">
                <span><i className="dyn-dot dyn-kin" /> {t('dyn.kinetic')}</span>
                <span><i className="dyn-dot dyn-aud" /> {t('dyn.audio')}</span>
                <span className="dyn-genre">{plan.genre_baseline.replace(/_/g, ' ')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

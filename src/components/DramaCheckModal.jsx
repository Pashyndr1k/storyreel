import { useMemo } from 'react';
import { useI18n } from '../lib/i18n.js';
import { checkProject, autoFixProject } from '../lib/shortDrama/check.js';

// The short-drama genre check: pacing and convention issues of the plan, the
// scene outline and the shots, grouped by episode, with the one mechanical fix
// (em dashes in dialogue) applied from here. Everything else is a rewrite —
// the user's or the agent's.
export default function DramaCheckModal({ project, update, onClose }) {
  const { t } = useI18n();
  const report = useMemo(() => checkProject(project), [project]);
  const fixable = report.issues.filter((i) => i.fixable).length;
  const byEpisode = useMemo(() => {
    const m = new Map();
    for (const i of report.issues) {
      const k = i.episode || 0;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(i);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [report]);
  const applyFix = () => {
    const { changed, patch } = autoFixProject(project);
    if (changed) update(patch);
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal drama-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head-row">
          <h2 title={t('drama.checkHint')}>{t('drama.checkTitle')}</h2>
          <span className={`total-badge ${report.ok ? '' : 'over'}`} title={t('drama.scoreTip')}>{t('drama.score', { n: report.score })}</span>
        </div>
        <p className="hint">{report.summary}</p>
        {report.landmarks && (
          <p className="hint">
            {t('drama.landmarks', { w: report.landmarks.firstWinBy, r: report.landmarks.firstReversal, p: report.landmarks.paywall, b: report.landmarks.midBetrayal, c: report.landmarks.climax })}
          </p>
        )}
        {report.episodes.length > 0 && (
          <div className="drama-metrics">
            {report.episodes.map((m) => (
              <div key={m.number} className="drama-metric" title={t('drama.metricTip')}>
                <strong>{t('ser.epShort', { n: m.number })}</strong>
                <span>{m.seconds}s · {m.shots} {t('drama.shots')} · {m.lines} {t('drama.lines')} · {m.spokenWords} {t('drama.words')} · {m.turns} {t('drama.turns')}{m.hookTag ? ` · ${m.hookTag}` : ''}</span>
              </div>
            ))}
          </div>
        )}
        {report.issues.length === 0 ? (
          <p className="hint">{t('drama.clean')}</p>
        ) : (
          <div className="drama-issues">
            {byEpisode.map(([ep, list]) => (
              <div key={ep} className="drama-ep">
                <h4>{ep ? t('ser.epShort', { n: ep }) : t('drama.general')}</h4>
                {list.map((i, k) => (
                  <div key={k} className={`drama-issue ${i.level}`}>
                    <span className="drama-level">{t(`drama.level_${i.level}`)}</span>
                    <span>{i.message}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          {fixable > 0 && (
            <button type="button" className="btn small" title={t('drama.fixDashesTip')} onClick={applyFix}>
              {t('drama.fixDashes', { n: fixable })}
            </button>
          )}
          <button type="button" className="btn primary" title={t('tip.done')} onClick={onClose}>{t('pset.done')}</button>
        </div>
      </div>
    </div>
  );
}

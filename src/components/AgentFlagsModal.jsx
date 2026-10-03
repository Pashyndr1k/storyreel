import { useEffect } from 'react';
import { useI18n } from '../lib/i18n.js';

// Flags: problems the AI agent recorded (or that were flagged automatically
// after four failed attempts). The person reviews them here, jumps to the
// place, and resolves a flag once it is dealt with — resolving also clears
// the attempt counter of that target, so the agent may work on it again.
export default function AgentFlagsModal({ project, update, onGoto, onClose }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const flags = (project.agentFlags || []).filter((f) => !f.resolved);

  const where = (f) => {
    const tg = f.target || {};
    if (tg.shotId) {
      for (const [n, sc] of project.outline.entries()) {
        const i = (project.sceneDetails[sc.id]?.shots || []).findIndex((s) => s.id === tg.shotId);
        if (i >= 0) return t('flag.whereShot', { s: n + 1, n: i + 1 });
      }
      return t('flag.whereGone');
    }
    if (tg.sceneId) {
      const n = project.outline.findIndex((s) => s.id === tg.sceneId);
      return n >= 0 ? t('flag.whereScene', { s: n + 1 }) : t('flag.whereGone');
    }
    return tg.stage ? t('flag.whereStage', { n: tg.stage === 'smart_edit' ? '—' : tg.stage }) : '';
  };

  const resolve = (f) =>
    update((p) => {
      const attempts = { ...(p.agentAttempts || {}) };
      const tg = f.target || {};
      // every counter of the flagged target starts over
      for (const key of Object.keys(attempts)) {
        if ((tg.shotId && key.startsWith(`shot:${tg.shotId}:`)) || (!tg.shotId && tg.sceneId && key.startsWith(`scene:${tg.sceneId}:`)) || (tg.stage && key === `stage:${tg.stage}`)) delete attempts[key];
      }
      return { agentFlags: (p.agentFlags || []).map((x) => (x.id === f.id ? { ...x, resolved: true, resolvedAt: Date.now() } : x)), agentAttempts: attempts };
    });

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide flags-modal" onClick={(e) => e.stopPropagation()}>
        <h2 title={t('flag.hint')}>{t('flag.title')}</h2>
        <p className="hint">{t('flag.hint')}</p>
        {flags.length === 0 ? (
          <p className="hint">{t('flag.none')}</p>
        ) : (
          <div className="flag-list">
            {flags.map((f) => (
              <div key={f.id} className="flag-row">
                <div className="flag-head">
                  <span className="sr-tag" title={t('ind.flagKind')}>{t(`flag.kind_${f.kind}`)}</span>
                  <strong>{where(f)}</strong>
                  {f.attempts > 0 && <span className="total-badge" title={t('ind.flagAttempts')}>{t('flag.attempts', { n: f.attempts })}</span>}
                </div>
                <p>{f.issue}</p>
                {f.note && <p className="hint">{f.note}</p>}
                <div className="row">
                  <button title={t('tip.flagGoto')} className="btn small" onClick={() => onGoto(f)}>{t('flag.goto')}</button>
                  <button title={t('tip.flagResolve')} className="btn small primary" onClick={() => resolve(f)}>{t('flag.resolve')}</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn primary" title={t('tip.close')} onClick={onClose}>{t('set.close')}</button>
        </div>
      </div>
    </div>
  );
}

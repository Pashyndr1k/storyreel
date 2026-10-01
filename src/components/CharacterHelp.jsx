import { useEffect } from 'react';
import { useI18n } from '../lib/i18n.js';

// Stage 2 help panel: the rules character profiles follow — what each field
// is for, what the first photo does versus the others, how names are matched
// in shots, how profiles reach the prompts, groups, and the limits. The text
// lives in i18n ('chelp.sN.h' = section heading, 'chelp.sN.b' = its points,
// one per line).
const SECTIONS = [1, 2, 3, 4, 5, 6];

export default function CharacterHelp({ onClose }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide help-modal" onClick={(e) => e.stopPropagation()}>
        <h2 title={t('chelp.intro')}>{t('chelp.title')}</h2>
        <p className="hint">{t('chelp.intro')}</p>
        <div className="help-cols">
          {SECTIONS.map((n) => (
            <section key={n} className="help-sec">
              <h3>{t(`chelp.s${n}.h`)}</h3>
              <ul>
                {t(`chelp.s${n}.b`)
                  .split('\n')
                  .filter(Boolean)
                  .map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn primary" title={t('tip.close')} onClick={onClose}>{t('set.close')}</button>
        </div>
      </div>
    </div>
  );
}

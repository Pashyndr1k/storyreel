import { useEffect } from 'react';
import { useI18n } from '../lib/i18n.js';

// Centered message shown when the active content policy refuses a generation:
// what was refused, why, and the rule it conflicts with. `unverified` means
// the check itself could not run (no text key, network) — generation is
// blocked then as well.
export default function PolicyNotice({ notice, onClose }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { rule, explanation, policyName, unverified } = notice;
  return (
    <div className="overlay policy-overlay" onClick={onClose}>
      <div className="modal policy-modal" role="alertdialog" onClick={(e) => e.stopPropagation()}>
        <h2>{t('pol.title')}</h2>
        <p>{t(unverified ? 'pol.unverified' : 'pol.blocked', { name: policyName })}</p>
        {!unverified && explanation && <p className="policy-why">{explanation}</p>}
        {!unverified && rule && (
          <blockquote className="policy-rule">
            <b>{t('pol.rule')}</b>
            {rule}
          </blockquote>
        )}
        {unverified && (
          <>
            {explanation && (
              <blockquote className="policy-rule">
                <b>{t('pol.reason')}</b>
                {explanation}
              </blockquote>
            )}
            <p className="policy-why hint">{t('pol.fix')}</p>
          </>
        )}
        <div className="modal-actions">
          <button className="btn primary" title={t('tip.close')} onClick={onClose}>{t('set.close')}</button>
        </div>
      </div>
    </div>
  );
}

import { useI18n } from '../lib/i18n.js';

export default function ErrorNote({ error, onSettings }) {
  const { t } = useI18n();
  if (!error) return null;
  if (error === 'NO_KEY') {
    return (
      <div className="note warn">
        {t('err.noKey')}{' '}
        <button className="btn small" onClick={onSettings}>{t('err.openSettings')}</button>
      </div>
    );
  }
  return <div className="note error">{t('err.failed')} {error}</div>;
}

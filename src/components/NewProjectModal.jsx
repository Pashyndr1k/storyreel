import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';

export default function NewProjectModal({ onCreate, onClose }) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [logline, setLogline] = useState('');

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('new.title')}</h2>
        <label>{t('new.titleLabel')}</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('new.titlePlaceholder')}
          autoFocus
        />
        <label>{t('new.plotLabel')}</label>
        <textarea
          rows={6}
          value={logline}
          onChange={(e) => setLogline(e.target.value)}
          placeholder={t('new.plotPlaceholder')}
        />
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>{t('new.cancel')}</button>
          <button
            className="btn primary"
            disabled={!logline.trim()}
            onClick={() => onCreate(title, logline.trim())}
          >
            {t('new.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

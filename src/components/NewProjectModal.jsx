import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import AutoTextarea from './AutoTextarea.jsx';
import VoiceButton from './VoiceButton.jsx';
import AspectSelector from './AspectSelector.jsx';

const TYPES = ['short', 'medium', 'long'];

export default function NewProjectModal({ onCreate, onClose, settings }) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [logline, setLogline] = useState('');
  const [type, setType] = useState('medium');
  const [aspect, setAspect] = useState('16:9');

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
        <label>{t('new.type')}</label>
        <div className="type-cards">
          {TYPES.map((k) => (
            <button
              key={k}
              type="button"
              className={`type-card ${type === k ? 'selected' : ''}`}
              onClick={() => setType(k)}
            >
              <strong>{t(`new.type_${k}`)}</strong>
              <span>{t(`new.typeHint_${k}`)}</span>
            </button>
          ))}
        </div>
        <label>{t('new.aspect')}</label>
        <AspectSelector value={aspect} onChange={setAspect} />

        <label>{t('new.plotLabel')}</label>
        <div className="voice-row">
          <AutoTextarea
            minRows={5}
            value={logline}
            onChange={(e) => setLogline(e.target.value)}
            placeholder={t('new.plotPlaceholder')}
          />
          <VoiceButton
            settings={settings}
            onText={(text) => setLogline((v) => (v ? `${v} ${text}` : text))}
          />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>{t('new.cancel')}</button>
          <button
            className="btn primary"
            disabled={!logline.trim()}
            onClick={() => onCreate(title, logline.trim(), type, aspect)}
          >
            {t('new.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

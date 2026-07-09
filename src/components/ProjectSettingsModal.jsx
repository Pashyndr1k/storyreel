import { useI18n } from '../lib/i18n.js';
import AutoTextarea from './AutoTextarea.jsx';

export default function ProjectSettingsModal({ project, update, onClose }) {
  const { t } = useI18n();

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>{t('pset.title')}</h2>

        <label>{t('pset.projectTitle')}</label>
        <input
          value={project.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder={t('pset.projectTitle')}
        />

        <label>{t('pset.systemPrompt')}</label>
        <p className="hint">{t('pset.systemPromptHint')}</p>
        <AutoTextarea
          minRows={4}
          value={project.systemPrompt || ''}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          placeholder={t('pset.systemPromptPh')}
        />

        <label>{t('pset.templates')}</label>
        <p className="hint">{t('pset.templatesHint')}</p>
        <label className="sub-label">{t('pset.imageTpl')}</label>
        <AutoTextarea
          minRows={3}
          value={project.imageTemplate || ''}
          onChange={(e) => update({ imageTemplate: e.target.value })}
          placeholder={t('pset.imageTplPh')}
        />
        <label className="sub-label">{t('pset.videoTpl')}</label>
        <AutoTextarea
          minRows={3}
          value={project.videoTemplate || ''}
          onChange={(e) => update({ videoTemplate: e.target.value })}
          placeholder={t('pset.videoTplPh')}
        />

        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>{t('pset.done')}</button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { STYLE_CATEGORIES } from '../lib/styles.js';
import StylesModal from './StylesModal.jsx';

export default function ProjectSettingsModal({ project, update, styles, setStyles, onClose }) {
  const { t } = useI18n();
  const [manageCat, setManageCat] = useState(null); // opens the library manager at a category

  const idField = { script: 'scriptStyleId', image: 'imageStyleId', video: 'videoStyleId' };

  const selector = (cat) => (
    <div className="style-select" key={cat}>
      <label>{t(`pset.style_${cat}`)}</label>
      <p className="hint">{t(`pset.styleHint_${cat}`)}</p>
      <div className="row">
        <select
          className="grow"
          value={project[idField[cat]] || ''}
          onChange={(e) => update({ [idField[cat]]: e.target.value })}
        >
          <option value="">{t('pset.styleNone')}</option>
          {(styles[cat] || []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button className="btn small" onClick={() => setManageCat(cat)}>{t('pset.manage')}</button>
      </div>
    </div>
  );

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

        <label className="section-label">{t('pset.styles')}</label>
        {STYLE_CATEGORIES.map((c) => selector(c))}

        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>{t('pset.done')}</button>
        </div>
      </div>

      {manageCat && (
        <StylesModal
          styles={styles}
          setStyles={setStyles}
          initialCat={manageCat}
          onClose={() => setManageCat(null)}
        />
      )}
    </div>
  );
}

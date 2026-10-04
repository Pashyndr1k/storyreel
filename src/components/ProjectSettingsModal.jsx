import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { STYLE_CATEGORIES } from '../lib/styles.js';
import StylesModal from './StylesModal.jsx';
import AspectSelector from './AspectSelector.jsx';
import { styleLabel } from './StyleControls.jsx';
import ScriptExportModal from './ScriptExportModal.jsx';
import { scriptReady } from '../lib/scriptExport.js';
import { isSeriesMaster, clampEpisodes, SERIES_MIN_EPISODES, SERIES_MAX_EPISODES } from '../lib/series.js';

export default function ProjectSettingsModal({ project, update, styles, setStyles, settings, onSettings, onClose }) {
  const { t } = useI18n();
  const [manageCat, setManageCat] = useState(null); // opens the library manager at a category
  const [showExport, setShowExport] = useState(false);

  const idField = { script: 'scriptStyleId', image: 'imageStyleId', video: 'videoStyleId' };

  const selector = (cat) => (
    <div className="style-select" key={cat}>
      <label>{t(`pset.style_${cat}`)}</label>
      <p className="hint">{t(`pset.styleHint_${cat}`)}</p>
      <div className="row">
        <select title={t(`pset.styleHint_${cat}`)}
          className="grow"
          value={project[idField[cat]] || ''}
          onChange={(e) => update({ [idField[cat]]: e.target.value })}
        >
          <option value="">{t('pset.styleNone')}</option>
          {(styles[cat] || []).map((s) => (
            <option key={s.id} value={s.id}>{styleLabel(s, t)}</option>
          ))}
        </select>
        <button title={t('tip.manageStyles')} className="btn small" onClick={() => setManageCat(cat)}>{t('pset.manage')}</button>
      </div>
    </div>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2 title={t('tip.psetTitle')}>{t('pset.title')}</h2>

        <label>{t('pset.projectTitle')}</label>
        <input
          value={project.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder={t('pset.projectTitle')}
        />

        {isSeriesMaster(project) && (
          <>
            <label className="section-label" htmlFor="pset-episodes">{t('new.episodes')}</label>
            <p className="hint">{t('pset.episodesHint')}</p>
            <input
              id="pset-episodes"
              key={project.episodeCount}
              type="number"
              className="episodes-input"
              title={t('tip.episodes')}
              min={SERIES_MIN_EPISODES}
              max={SERIES_MAX_EPISODES}
              defaultValue={project.episodeCount}
              onBlur={(e) => update({ episodeCount: clampEpisodes(e.target.value) })}
            />
          </>
        )}

        <label className="section-label">{t('pset.aspect')}</label>
        <p className="hint">{t('pset.aspectHint')}</p>
        <AspectSelector
          value={project.aspectRatio || '16:9'}
          onChange={(v) => update({ aspectRatio: v })}
        />

        <label className="section-label">{t('pset.layout')}</label>
        <p className="hint">{t('pset.layoutHint')}</p>
        <label className="check-row" title={t('tip.psetLayout')}>
          <input type="checkbox" checked={!!project.useLayout} onChange={(e) => update({ useLayout: e.target.checked })} />
          <span>{t('pset.layoutOn')}</span>
        </label>

        <label className="section-label">{t('pset.styles')}</label>
        {STYLE_CATEGORIES.map((c) => selector(c))}

        <label className="section-label">{t('sx.title')}</label>
        <p className="hint">{scriptReady(project) ? t('sx.hint') : t('sx.notReady')}</p>
        <div className="row">
          <button title={t('tip.sxOpen')} className="btn small" disabled={!scriptReady(project)} onClick={() => setShowExport(true)}>
            {t('sx.button')}
          </button>
        </div>

        <div className="modal-actions">
          <button title={t('tip.done')} className="btn primary" onClick={onClose}>{t('pset.done')}</button>
        </div>
      </div>

      {showExport && <ScriptExportModal project={project} onClose={() => setShowExport(false)} />}
      {manageCat && (
        <StylesModal
          styles={styles}
          setStyles={setStyles}
          settings={settings}
          onSettings={onSettings}
          initialCat={manageCat}
          onClose={() => setManageCat(null)}
        />
      )}
    </div>
  );
}

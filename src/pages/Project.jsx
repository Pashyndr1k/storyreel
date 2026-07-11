import { useState } from 'react';
import Stage1 from '../stages/Stage1.jsx';
import Stage2 from '../stages/Stage2.jsx';
import Stage3 from '../stages/Stage3.jsx';
import Stage4 from '../stages/Stage4.jsx';
import Stage5 from '../stages/Stage5.jsx';
import { buildProjectExport, downloadText } from '../lib/exportScript.js';
import { LANGS, useI18n } from '../lib/i18n.js';
import { resolveStyleText } from '../lib/styles.js';
import ProjectSettingsModal from '../components/ProjectSettingsModal.jsx';
import SmartEditModal from '../components/SmartEditModal.jsx';
import { ArrowLeft, Download, Sliders, Cog, Wand } from '../components/icons.jsx';

export default function Project({ project, updateProject, settings, styles, setStyles, onBack, onSettings }) {
  const { t, lang } = useI18n();
  const [view, setView] = useState(Math.min(project.stage, 5));
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showSmartEdit, setShowSmartEdit] = useState(false);
  const [staleFrom, setStaleFrom] = useState(null);

  const STAGES = [1, 2, 3, 4, 5].map((n) => ({ n, label: t(`stages.${n}`) }));

  // Language of the generated script content: per-project override, else app language.
  const genLang = project.lang || lang;

  const update = (patch) => updateProject(project.id, patch);

  // Edits made on an earlier stage make the later, already-generated stages stale.
  const stageUpdate = (patch) => {
    update(patch);
    if (view < project.stage) {
      setStaleFrom((prev) => (prev === null ? view : Math.min(prev, view)));
    }
  };

  const goNext = () => {
    const next = Math.min(view + 1, 5);
    update((p) => ({ stage: Math.max(p.stage, next) }));
    setView(next);
  };

  const exportScript = () => {
    const safe = project.title.replace(/[^\w\d\- ]+/g, '').trim().replace(/\s+/g, '-') || 'script';
    downloadText(`${safe}.md`, buildProjectExport(project, genLang));
  };

  // Resolve the project's selected styles into instruction text for the prompts.
  const scriptStyle = resolveStyleText(styles, 'script', project.scriptStyleId);
  const imageStyle = resolveStyleText(styles, 'image', project.imageStyleId);
  const videoStyle = resolveStyleText(styles, 'video', project.videoStyleId);

  const stageProps = {
    project,
    update: stageUpdate,
    settings,
    goNext,
    onSettings,
    genLang,
    scriptStyle,
    imageStyle,
    videoStyle,
  };

  return (
    <div className="page project-page">
      <header className="project-header">
        <button className="btn back" onClick={onBack}><ArrowLeft size={16} />{t('proj.back')}</button>
        <div className="project-title-block">
          <input
            className="title-input"
            value={project.title}
            onChange={(e) => update({ title: e.target.value })}
          />
          <input
            key={project.genres.join('|')}
            className="genres-input"
            defaultValue={project.genres.join(', ')}
            placeholder={t('proj.genresPlaceholder')}
            onBlur={(e) =>
              update({
                genres: e.target.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3),
              })
            }
          />
        </div>
        <div className="header-actions">
          <select
            className="lang-select"
            title={t('proj.langLabel')}
            value={project.lang || ''}
            onChange={(e) => update({ lang: e.target.value })}
          >
            <option value="">{t('proj.langDefault')}</option>
            {LANGS.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          <button className="btn" onClick={() => setShowSmartEdit(true)}>
            <Wand size={16} /> {t('edit.button')}
          </button>
          <button className="btn" onClick={exportScript}><Download size={16} />{t('proj.export')}</button>
          <button className="btn" title={t('proj.settings')} onClick={() => setShowProjectSettings(true)}>
            <Sliders size={16} /> {t('proj.settings')}
          </button>
          <button className="btn" title={t('set.title')} aria-label={t('set.title')} onClick={onSettings}><Cog size={16} /></button>
        </div>
      </header>

      {showProjectSettings && (
        <ProjectSettingsModal
          project={project}
          update={update}
          styles={styles}
          setStyles={setStyles}
          onClose={() => setShowProjectSettings(false)}
        />
      )}
      {showSmartEdit && (
        <SmartEditModal
          project={project}
          update={update}
          settings={settings}
          genLang={genLang}
          onClose={() => setShowSmartEdit(false)}
          onSettings={onSettings}
        />
      )}

      <nav className="stage-timeline">
        {STAGES.map((s) => (
          <button
            key={s.n}
            className={`tl-seg ${view === s.n ? 'current' : ''} ${s.n < project.stage && view !== s.n ? 'done' : ''}`}
            disabled={s.n > project.stage}
            onClick={() => setView(s.n)}
          >
            <span className="tl-num">{s.n < project.stage && view !== s.n ? '✓' : s.n}</span>
            <span className="tl-label">{s.label}</span>
          </button>
        ))}
      </nav>

      {view === 1 && <Stage1 {...stageProps} />}
      {view === 2 && <Stage2 {...stageProps} />}
      {view === 3 && <Stage3 {...stageProps} />}
      {view === 4 && <Stage4 {...stageProps} />}
      {view === 5 && <Stage5 {...stageProps} />}

      {staleFrom !== null && staleFrom < project.stage && (
        <div className="stale-toast">
          <p>{t('stale.msg', { n: staleFrom })}</p>
          <div className="row">
            <button
              className="btn small primary"
              onClick={() => {
                setView(Math.min(staleFrom + 1, 5));
                setStaleFrom(null);
              }}
            >
              {t('stale.go', { n: Math.min(staleFrom + 1, 5) })}
            </button>
            <button className="btn small" onClick={() => setStaleFrom(null)}>
              {t('stale.dismiss')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

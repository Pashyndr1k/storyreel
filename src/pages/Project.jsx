import { useState } from 'react';
import Stage1 from '../stages/Stage1.jsx';
import Stage2 from '../stages/Stage2.jsx';
import Stage3 from '../stages/Stage3.jsx';
import Stage4 from '../stages/Stage4.jsx';
import Stage5 from '../stages/Stage5.jsx';
import Stage6 from '../stages/Stage6.jsx';
import { buildProjectExport, downloadText } from '../lib/exportScript.js';
import { useI18n } from '../lib/i18n.js';
import { resolveStyleText } from '../lib/styles.js';
import ProjectSettingsModal from '../components/ProjectSettingsModal.jsx';
import SmartEditModal from '../components/SmartEditModal.jsx';
import Dropdown from '../components/Dropdown.jsx';
import { ArrowLeft, Download, Sliders, Cog, PencilStar, Check, Globe } from '../components/icons.jsx';
import { LANGS } from '../lib/i18n.js';

export default function Project({ project, updateProject, settings, setSettings, styles, setStyles, library, libUpsert, onBack, onSettings }) {
  const { t, lang } = useI18n();
  const [view, setView] = useState(Math.min(project.stage, 6));
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showSmartEdit, setShowSmartEdit] = useState(false);
  const [staleFrom, setStaleFrom] = useState(null);

  const STAGES = [1, 2, 3, 4, 5, 6].map((n) => ({ n, label: t(`stages.${n}`) }));

  // One global language drives both the UI and script generation (prompts for
  // image/video generation stay English). Already-generated text is untouched.
  const genLang = lang;

  const update = (patch) => updateProject(project.id, patch);

  // Edits made on an earlier stage make the later, already-generated stages stale.
  const stageUpdate = (patch) => {
    update(patch);
    if (view < project.stage) {
      setStaleFrom((prev) => (prev === null ? view : Math.min(prev, view)));
    }
  };

  const goNext = () => {
    const next = Math.min(view + 1, 6);
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
    library,
    libUpsert,
  };

  const langOptions = LANGS.map((l) => ({
    value: l.id,
    label: { en: 'EN', ru: 'RU', uk: 'UA' }[l.id] || l.id.toUpperCase(),
  }));

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
          <Dropdown
            pill
            value={settings.lang || 'en'}
            options={langOptions}
            onChange={(l) => setSettings({ ...settings, lang: l })}
            icon={<Globe size={15} />}
            title={t('set.language')}
          />
          <button className="icon-btn h44" title={t('edit.button')} aria-label={t('edit.button')} onClick={() => setShowSmartEdit(true)}>
            <PencilStar size={18} />
          </button>
          <button className="icon-btn h44" title={t('proj.export')} aria-label={t('proj.export')} onClick={exportScript}>
            <Download size={18} />
          </button>
          <button className="icon-btn h44" title={t('proj.settings')} aria-label={t('proj.settings')} onClick={() => setShowProjectSettings(true)}>
            <Sliders size={18} />
          </button>
          <button className="icon-btn h44" title={t('set.title')} aria-label={t('set.title')} onClick={onSettings}>
            <Cog size={18} />
          </button>
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

      <nav className="stg-bar">
        {STAGES.map((s) => {
          const sel = view === s.n;
          const done = s.n < project.stage;
          const pos = sel ? 'sel' : s.n === view - 1 ? 'nb-left' : s.n === view + 1 ? 'nb-right' : 'far';
          return (
            <button
              key={s.n}
              className={`stg ${pos}`}
              disabled={s.n > project.stage}
              onClick={() => setView(s.n)}
            >
              <span className="stg-num">{s.n}</span>
              <span className="stg-title">{s.label}</span>
              {done && !sel && <Check size={16} className="stg-check" />}
            </button>
          );
        })}
      </nav>

      {view === 1 && <Stage1 {...stageProps} />}
      {view === 2 && <Stage2 {...stageProps} />}
      {view === 3 && <Stage3 {...stageProps} />}
      {view === 4 && <Stage4 {...stageProps} />}
      {view === 5 && <Stage5 {...stageProps} />}
      {view === 6 && <Stage6 {...stageProps} />}

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

import { useAgentScope } from '../lib/agent/registry.js';
import { STAGE_COUNT } from '../lib/config.js';
import { useState } from 'react';
import Stage1 from '../stages/Stage1.jsx';
import Stage2 from '../stages/Stage2.jsx';
import Stage3 from '../stages/Stage3.jsx';
import Stage4 from '../stages/Stage4.jsx';
import Stage6 from '../stages/Stage6.jsx';
import { exportProjectZip } from '../lib/projectFiles.js';
import { useI18n } from '../lib/i18n.js';
import { useLibrarySync } from '../lib/useLibrarySync.js';
import { resolveStyleText } from '../lib/styles.js';
import ProjectSettingsModal from '../components/ProjectSettingsModal.jsx';
import SmartEditModal from '../components/SmartEditModal.jsx';
import AgentFlagsModal from '../components/AgentFlagsModal.jsx';
import { waitScope } from '../lib/agent/registry.js';
import Dropdown from '../components/Dropdown.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { ArrowLeft, Download, Sliders, Cog, Stars, Check, Globe, Flag } from '../components/icons.jsx';
import { LANGS } from '../lib/i18n.js';

export default function Project({ project, updateProject, settings, setSettings, styles, setStyles, library, libUpsert, libDelete, onBack, onSettings, addProjects, openProject, projectExists }) {
  const { t, lang } = useI18n();
  // character and location cards edited in the project update their library cards
  useLibrarySync(project, library, libUpsert);
  const [view, setView] = useState(Math.min(project.stage, STAGE_COUNT));
  useAgentScope('project', { id: project.id, view, setView });
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showSmartEdit, setShowSmartEdit] = useState(false);
  const [showFlags, setShowFlags] = useState(false);
  const openFlags = (project.agentFlags || []).filter((f) => !f.resolved).length;
  // jump to what a flag points at: a shot or scene of Stage 5, or a text stage
  const gotoFlag = async (f) => {
    setShowFlags(false);
    const tg = f.target || {};
    if (tg.shotId || tg.sceneId) {
      setView(STAGE_COUNT);
      const assembly = await waitScope('assembly', (s) => s.projectId === project.id, 4000);
      assembly?.select(tg.sceneId, tg.shotId || null);
    } else if (Number(tg.stage) >= 1) setView(Math.min(Number(tg.stage), STAGE_COUNT));
  };
  const [staleFrom, setStaleFrom] = useState(null);

  const STAGES = Array.from({ length: STAGE_COUNT }, (_, i) => i + 1).map((n) => ({ n, label: t(`stages.${n}`) }));

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
    const next = Math.min(view + 1, STAGE_COUNT);
    update((p) => ({ stage: Math.max(p.stage, next) }));
    setView(next);
  };

  // Export = one ZIP with project.md (all data, media-free) plus every image
  // and video as a standard file; Electron prompts for the destination.
  const [exporting, setExporting] = useState(false);
  const exportScript = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportProjectZip(project, genLang);
    } catch (e) {
      window.alert(e.message || String(e));
    } finally {
      setExporting(false);
    }
  };

  // Resolve the project's selected styles into instruction text for the prompts.
  const scriptStyle = resolveStyleText(styles, 'script', project.scriptStyleId);
  const imageStyle = resolveStyleText(styles, 'image', project.imageStyleId);
  // "image+" styles are applied strictly and literally by the prompt builders.
  const imageStylePlus = !!(styles?.image || []).find((s) => s.id === project.imageStyleId)?.plus;
  const videoStyle = resolveStyleText(styles, 'video', project.videoStyleId);

  const stageProps = {
    project,
    update: stageUpdate,
    // Style selection is configuration, not content — changing it shouldn't
    // trigger the "later stages are stale" toast, matching the settings modal.
    rawUpdate: update,
    settings,
    goNext,
    onSettings,
    onProjectSettings: () => setShowProjectSettings(true),
    genLang,
    styles,
    scriptStyle,
    imageStyle,
    imageStylePlus,
    videoStyle,
    setSettings, // the shot workbench can switch the generation model
    library,
    libUpsert,
    libDelete,
    // a series master creates its production projects at Stage 3
    addProjects,
    openProject,
    projectExists,
  };

  const langOptions = LANGS.map((l) => ({
    value: l.id,
    label: { en: 'EN', ru: 'RU', uk: 'UA' }[l.id] || l.id.toUpperCase(),
  }));

  return (
    <div className="page project-page">
      <header className="project-header">
        <button className="btn back" onClick={onBack} title={t('proj.back')} aria-label={t('proj.back')}>
          <ArrowLeft size={22} />
        </button>
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
          <ThemeToggle theme={settings.theme || 'dark'} setTheme={(th) => setSettings({ ...settings, theme: th })} />
          {openFlags > 0 && (
            <button className="icon-btn h44 flags-btn" title={t('flag.button', { n: openFlags })} aria-label={t('flag.button', { n: openFlags })} onClick={() => setShowFlags(true)}>
              <Flag size={16} />
              <span className="flags-count">{openFlags}</span>
            </button>
          )}
          <button className="icon-btn h44" title={t('edit.button')} aria-label={t('edit.button')} onClick={() => setShowSmartEdit(true)}>
            <Stars size={16} />
          </button>
          <button className="icon-btn h44" title={t('proj.export')} aria-label={t('proj.export')} onClick={exportScript}>
            <Download size={16} />
          </button>
          <button className="icon-btn h44" title={t('proj.settings')} aria-label={t('proj.settings')} onClick={() => setShowProjectSettings(true)}>
            <Sliders size={16} />
          </button>
          <button className="icon-btn h44" title={t('set.title')} aria-label={t('set.title')} onClick={onSettings}>
            <Cog size={16} />
          </button>
        </div>
      </header>

      {showProjectSettings && (
        <ProjectSettingsModal
          project={project}
          update={update}
          styles={styles}
          setStyles={setStyles}
          settings={settings}
          onSettings={onSettings}
          onClose={() => setShowProjectSettings(false)}
        />
      )}
      {showFlags && <AgentFlagsModal project={project} update={update} onGoto={gotoFlag} onClose={() => setShowFlags(false)} />}
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

      <nav className="stg-bar" style={{ '--stage-count': STAGE_COUNT }}>
        {STAGES.map((s) => {
          const sel = view === s.n;
          const done = s.n < project.stage;
          const pos = sel ? 'sel' : s.n === view - 1 ? 'nb-left' : s.n === view + 1 ? 'nb-right' : 'far';
          return (
            <button title={s.n > project.stage ? t('tip.stageLocked') : t('tip.stageGo', { s: s.label })}
              key={s.n}
              className={`stg ${pos}`}
              disabled={s.n > project.stage}
              onClick={() => setView(s.n)}
            >
              <span className="stg-num">{String(s.n).padStart(2, '0')}</span>
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
      {/* 2.5: generation and assembly share one workspace */}
      {view === 5 && <Stage6 {...stageProps} />}

      {staleFrom !== null && staleFrom < project.stage && !settings.hideStaleToast && (
        <div className="stale-toast">
          <p>{t('stale.msg', { n: staleFrom })}</p>
          <div className="row">
            <button title={t('tip.staleGo')}
              className="btn small primary"
              onClick={() => {
                setView(Math.min(staleFrom + 1, STAGE_COUNT));
                setStaleFrom(null);
              }}
            >
              {t('stale.go', { n: Math.min(staleFrom + 1, STAGE_COUNT) })}
            </button>
            <button title={t('tip.staleDismiss')} className="btn small" onClick={() => setStaleFrom(null)}>
              {t('stale.dismiss')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

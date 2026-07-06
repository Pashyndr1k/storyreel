import { useState } from 'react';
import Stage1 from '../stages/Stage1.jsx';
import Stage2 from '../stages/Stage2.jsx';
import Stage3 from '../stages/Stage3.jsx';
import Stage4 from '../stages/Stage4.jsx';
import Stage5 from '../stages/Stage5.jsx';
import { buildScriptMarkdown, downloadText } from '../lib/exportScript.js';
import { useI18n } from '../lib/i18n.js';

export default function Project({ project, updateProject, settings, onBack, onSettings }) {
  const { t, lang } = useI18n();
  const [view, setView] = useState(Math.min(project.stage, 5));

  const STAGES = [1, 2, 3, 4, 5].map((n) => ({ n, label: t(`stages.${n}`) }));

  const update = (patch) => updateProject(project.id, patch);

  const goNext = () => {
    const next = Math.min(view + 1, 5);
    update((p) => ({ stage: Math.max(p.stage, next) }));
    setView(next);
  };

  const exportScript = () => {
    const safe = project.title.replace(/[^\w\d\- ]+/g, '').trim().replace(/\s+/g, '-') || 'script';
    downloadText(`${safe}.md`, buildScriptMarkdown(project, lang));
  };

  const stageProps = { project, update, settings, goNext, onSettings };

  return (
    <div className="page project-page">
      <header className="project-header">
        <button className="btn back" onClick={onBack}>{t('proj.back')}</button>
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
          <button className="btn" onClick={exportScript}>{t('proj.export')}</button>
          <button className="btn" onClick={onSettings}>⚙</button>
        </div>
      </header>

      <nav className="stage-nav">
        {STAGES.map((s) => (
          <button
            key={s.n}
            className={`stage-tab ${view === s.n ? 'active' : ''} ${s.n < project.stage ? 'done' : ''}`}
            disabled={s.n > project.stage}
            onClick={() => setView(s.n)}
          >
            <span className="stage-num">{s.n < project.stage && view !== s.n ? '✓' : s.n}</span>
            {s.label}
          </button>
        ))}
      </nav>

      {view === 1 && <Stage1 {...stageProps} />}
      {view === 2 && <Stage2 {...stageProps} />}
      {view === 3 && <Stage3 {...stageProps} />}
      {view === 4 && <Stage4 {...stageProps} />}
      {view === 5 && <Stage5 {...stageProps} />}
    </div>
  );
}

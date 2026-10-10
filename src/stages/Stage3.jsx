import { useAgentScope } from '../lib/agent/registry.js';
import { BEATS, isShortDrama } from '../lib/shortDrama/rules.js';
import DramaCheckModal from '../components/DramaCheckModal.jsx';
import { planParts, cutsEvery, normalizeCuts, buildPartProject } from '../lib/split.js';
import { useGenerate } from '../lib/useGenerate.js';
import { stage3Prompt, durationOf } from '../lib/prompts.js';
import { uid } from '../lib/storage.js';
import { useI18n } from '../lib/i18n.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import { StyleChip } from '../components/StyleControls.jsx';
import DynamicsVisualizer from '../components/DynamicsVisualizer.jsx';
import { normalizePlan } from '../lib/dynamics.js';
import { Scissors, Grip, Stars } from '../components/icons.jsx';
import { useRef, useState } from 'react';
import Stage3Series from './Stage3Series.jsx';
import { isSeriesMaster, isSeriesInline, inlineSeriesPart, seriesChunkProject, EPISODES_PER_CALL } from '../lib/series.js';
import { generateJSON, textKeyError } from '../lib/claude.js';

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// A series master plans episodes instead of scenes; every other project
// (a series segment included) writes the scene outline.
export default function Stage3(props) {
  const { t } = useI18n();
  // an inline series keeps both views in one project: the plan and the scenes
  const [view, setView] = useState('scenes');
  if (!isSeriesMaster(props.project)) return <Stage3Outline {...props} />;
  if (!isSeriesInline(props.project)) return <Stage3Series {...props} onKept={() => setView('scenes')} />;
  const viewSwitch = (
    <div className="style-tabs series-view">
      {['plan', 'scenes'].map((v) => (
        <button key={v} type="button" title={t(`tip.serView_${v}`)} className={`chip ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
          {t(`ser.view_${v}`)}
        </button>
      ))}
    </div>
  );
  return view === 'plan' ? <Stage3Series {...props} viewSwitch={viewSwitch} /> : <Stage3Outline {...props} viewSwitch={viewSwitch} />;
}

function Stage3Outline({ project, update, settings, goNext, onSettings, onProjectSettings, genLang, styles, scriptStyle, viewSwitch = null, addProjects, openProject, projectExists }) {
  const { t } = useI18n();
  const { busy: runBusy, error: runError, run } = useGenerate(settings);
  const [chunk, setChunk] = useState(null); // inline series: { a, b } episodes being outlined
  const [chunkErr, setChunkErr] = useState('');
  const [showCheck, setShowCheck] = useState(false);
  const busy = runBusy || !!chunk;
  const error = chunkErr || runError;
  const outline = project.outline;
  const total = outline.reduce((a, s) => a + (s.duration || 0), 0);
  const maxDuration = durationOf(project).max;

  const sceneFrom = (s, i) => ({
    id: uid(),
    number: i + 1,
    // a series labels each scene with its episode
    title: `${project.seriesPart && Number(s.episode) ? `${t('ser.epShort', { n: Number(s.episode) })} · ` : ''}${s.title || `${t('s4.scene')} ${i + 1}`}`,
    ...(project.seriesPart && Number(s.episode) ? { episode: Number(s.episode) } : {}),
    summary: s.summary || '',
    duration: Number(s.duration_sec) || 20,
    ...(project.seriesPart && BEATS.includes(String(s.beat || '').toLowerCase()) ? { beat: String(s.beat).toLowerCase() } : {}),
  });

  // Inline series: the outline of the whole series, written a few episodes
  // per call. Scenes and rhythm blocks are appended as each call returns, so
  // a failure keeps what is already written.
  const generateInline = async () => {
    if (outline.length && !window.confirm(t('s3.replaceConfirm'))) return;
    const keyErr = textKeyError(settings);
    if (keyErr) return setChunkErr(keyErr);
    const part = inlineSeriesPart(project);
    if (!part.episodes.length) return setChunkErr(t('ser.splitNeedsPlan'));
    setChunkErr('');
    let scenes = [];
    let blocks = [];
    let elapsed = 0;
    let baseline = 'general';
    try {
      for (let from = 1, i = 0; from <= part.to; from += EPISODES_PER_CALL, i++) {
        const to = Math.min(part.to, from + EPISODES_PER_CALL - 1);
        setChunk({ a: from, b: to });
        const data = await generateJSON(settings, stage3Prompt(seriesChunkProject(project, part, from, to), genLang, scriptStyle));
        const offset = scenes.length;
        const got = (data.scenes || []).map((s, k) => sceneFrom(s, offset + k));
        const plan = normalizePlan(data.dynamics_plan);
        if (plan) {
          if (i === 0) baseline = plan.genre_baseline;
          blocks = [
            ...blocks,
            ...plan.rhythm_blocks.map((b, k) => ({
              ...b,
              block_id: `blk_${i + 1}_${k + 1}`,
              timestamp_start: b.timestamp_start + elapsed,
              scene_numbers: b.scene_numbers.map((n) => n + offset),
            })),
          ];
        }
        scenes = [...scenes, ...got];
        elapsed += got.reduce((a, s) => a + (s.duration || 0), 0);
        const snapScenes = scenes;
        const snapBlocks = blocks;
        update({
          seriesPart: part,
          outline: snapScenes,
          dynamicsPlan: snapBlocks.length ? { genre_baseline: baseline, global_pacing_curve: 'wave', rhythm_blocks: snapBlocks } : null,
          ...(i === 0 ? { sceneDetails: {}, shotPrompts: {} } : {}),
        });
      }
    } catch (e) {
      setChunkErr(e.message || String(e));
    } finally {
      setChunk(null);
    }
  };

  const generate = () => {
    if (isSeriesInline(project)) return generateInline();
    if (outline.length && !window.confirm(t('s3.replaceConfirm'))) return undefined;
    return run(stage3Prompt(project, genLang, scriptStyle), (data) =>
      update({
        outline: (data.scenes || []).map(sceneFrom),
        // The Action Dynamics Plan travels with the outline it was written for.
        dynamicsPlan: normalizePlan(data.dynamics_plan),
        sceneDetails: {},
        shotPrompts: {},
      })
    );
  };

  useAgentScope('stage3', { projectId: project.id, generate: () => generate(), error });

  const updateScene = (id, patch) =>
    update((p) => ({ outline: p.outline.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const removeScene = (id) =>
    update((p) => {
      const details = { ...p.sceneDetails };
      delete details[id];
      return { outline: p.outline.filter((s) => s.id !== id), sceneDetails: details };
    });

  const dragIdx = useRef(null);
  const [overIdx, setOverIdx] = useState(null);

  const moveTo = (from, to) =>
    update((p) => {
      const next = [...p.outline];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { outline: next };
    });

  const addScene = () =>
    update((p) => ({
      outline: [...p.outline, { id: uid(), number: p.outline.length + 1, title: '', summary: '', duration: 15 }],
    }));

  // ---- split into parts: cut the outline anywhere, each run of scenes
  // becomes its own project with everything already made for those scenes
  const cuts = normalizeCuts(project.splitCuts, outline.length);
  const parts = planParts(outline.length, cuts);
  // a project that is itself a part (an episode project of a series, a scene
  // part) is not split again
  const canSplit = outline.length >= 2 && typeof addProjects === 'function' && !project.partInfo && !project.seriesPart;
  const toggleCut = (k) => update((p) => ({ splitCuts: cuts.includes(k) ? cuts.filter((x) => x !== k) : [...cuts, k].sort((a, b) => a - b) }));
  const partMade = (part) => (project.parts || []).find((x) => x.from === part.from && x.to === part.to && projectExists?.(x.projectId));
  const pendingParts = cuts.length ? parts.filter((part) => !partMade(part)) : [];
  const partDur = (part) => outline.slice(part.from, part.to + 1).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const createParts = () => {
    if (!pendingParts.length) return;
    if (!window.confirm(t('split.confirm', { n: pendingParts.length }))) return;
    const made = pendingParts.map((part) => {
      const index = parts.indexOf(part) + 1;
      const label = t('split.partLabel', { n: index, m: parts.length });
      return { part, project: buildPartProject(project, part, index, parts.length, label) };
    });
    addProjects(made.map((x) => x.project));
    update((p) => ({ parts: [...(p.parts || []).filter((x) => projectExists?.(x.projectId)), ...made.map((x) => ({ from: x.part.from, to: x.part.to, projectId: x.project.id, title: x.project.title }))] }));
  };

  return (
    <section className="stage">
      <div className="stage-head-row">
        <h2 className="stage-h2" data-tip={t('s3.desc')}>{t('s3.title')}</h2>
      </div>
      {viewSwitch}

      <div className="row">
        <button title={t('tip.s3Generate')} className="btn primary" disabled={busy} onClick={generate}>
          {!outline.length && <Stars size={14} />} {chunk ? t('ser.outlineProg', { a: chunk.a, b: chunk.b }) : busy ? t('gen.generating') : outline.length ? t('s3.regenerate') : t('s3.generate')}
        </button>
        <StyleChip project={project} styles={styles} cat="script" onClick={onProjectSettings} />
        {isShortDrama(project) && <StyleChip project={project} styles={styles} cat="drama" onClick={onProjectSettings} />}
        {isShortDrama(project) && outline.length > 0 && (
          <button type="button" className="btn small" title={t('drama.checkBtnTip')} onClick={() => setShowCheck(true)}>{t('drama.checkBtn')}</button>
        )}
        {outline.length > 0 && (
          <span className={`total-badge ${total > maxDuration ? 'over' : ''}`}>
            {t('s3.total', { t: fmt(total) })} / ≤{fmt(maxDuration)}
          </span>
        )}
        <span className="push-right" />
        <DynamicsVisualizer plan={project.dynamicsPlan} />
      </div>
      <ErrorNote error={error} onSettings={onSettings} />
      {project.partInfo && (
        <div className="context-box static">
          <strong>{project.partInfo.parentTitle}</strong> · {t('split.partOf', { n: project.partInfo.index, m: project.partInfo.total, a: project.partInfo.from, b: project.partInfo.to })}
          <p>{t('split.partHint')}</p>
        </div>
      )}
      {project.seriesPart && (
        <div className="context-box static">
          <strong>{project.seriesPart.seriesTitle}</strong> · {t('ser.partOf', { a: project.seriesPart.from, b: project.seriesPart.to, n: project.seriesPart.total })}
          {project.seriesPart.arcTitle && <> · {project.seriesPart.arcTitle}</>}
          <p>{t('ser.partHint')}</p>
        </div>
      )}

      {outline.map((s, i) => (
        <div
          key={s.id}
          className={`scene-row ${overIdx === i ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (overIdx !== i) setOverIdx(i);
          }}
          onDragLeave={() => setOverIdx((v) => (v === i ? null : v))}
          onDrop={(e) => {
            e.preventDefault();
            setOverIdx(null);
            const from = dragIdx.current;
            dragIdx.current = null;
            if (from != null && from !== i) moveTo(from, i);
          }}
        >
          <div className="scene-num">{i + 1}</div>
          <div className="scene-fields">
            <div className="row">
              <input
                className="grow"
                value={s.title}
                placeholder={t('s3.scenePlaceholder')}
                onChange={(e) => updateScene(s.id, { title: e.target.value })}
              />
              <input
                type="number"
                min={2}
                max={300}
                className="dur-input"
                value={s.duration}
                onChange={(e) => updateScene(s.id, { duration: Number(e.target.value) || 0 })}
              />
              <span className="unit">{t('s3.sec')}</span>
            </div>
            <AutoTextarea
              minRows={2}
              value={s.summary}
              placeholder={t('s3.summaryPlaceholder')}
              onChange={(e) => updateScene(s.id, { summary: e.target.value })}
            />
          </div>
          <div className="scene-tools">
            <span
              className="drag-handle"
              title={t('dnd.reorder')}
              draggable
              onDragStart={(e) => {
                dragIdx.current = i;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(i));
              }}
              onDragEnd={() => {
                dragIdx.current = null;
                setOverIdx(null);
              }}
            >
              <Grip size={16} />
            </span>
            <button title={t('tip.removeScene')} className="btn danger tiny" onClick={() => removeScene(s.id)}>✕</button>
          </div>
        </div>
      ))}

      {outline.length > 0 && (
        <div className="row">
          <button title={t('tip.addScene')} className="btn small" onClick={addScene}>{t('s3.addScene')}</button>
        </div>
      )}

      {canSplit && (
        <div className="seg-panel">
          <h3 title={t('split.hint')}>{t('split.title')}</h3>
          <p className="hint">{t('split.hint')}</p>
          {/* the outline as a strip of scene numbers; the gaps between them are the cut points */}
          <div className="cut-strip" role="group" aria-label={t('split.title')}>
            {outline.map((s, i) => (
              <span key={s.id} className="cut-item">
                <span className="cut-scene" title={`${i + 1}. ${s.title || ''}`}>{i + 1}</span>
                {i < outline.length - 1 && (
                  <button
                    type="button"
                    className={`cut-gap ${cuts.includes(i) ? 'cut' : ''}`}
                    title={t(cuts.includes(i) ? 'split.uncutTip' : 'split.cutTip', { a: i + 1, b: i + 2 })}
                    aria-pressed={cuts.includes(i)}
                    onClick={() => toggleCut(i)}
                  >
                    <Scissors size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
          <div className="row">
            <label className="seg-size">
              <span>{t('split.every')}</span>
              <select
                title={t('split.everyTip')}
                value=""
                onChange={(e) => e.target.value && update({ splitCuts: cutsEvery(outline.length, Number(e.target.value)) })}
              >
                <option value="">—</option>
                {Array.from({ length: outline.length - 1 }, (_, k) => k + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            {cuts.length > 0 && (
              <button type="button" title={t('split.clearTip')} className="btn small" onClick={() => update({ splitCuts: [] })}>{t('split.clear')}</button>
            )}
            <button
              type="button"
              title={t('split.createTip')}
              className="btn primary"
              disabled={busy || !pendingParts.length}
              onClick={createParts}
            >
              {t('split.create', { n: pendingParts.length })}
            </button>
          </div>
          {cuts.length > 0 && (
            <div className="seg-list">
              {parts.map((part, k) => {
                const made = partMade(part);
                return (
                  <div key={`${part.from}-${part.to}`} className={`seg-row ${made ? 'made' : ''}`}>
                    <span className="seg-range">{t('split.partRange', { n: k + 1, a: part.from + 1, b: part.to + 1 })}</span>
                    <span className="seg-count" title={t('split.sceneCount')}>{part.to - part.from + 1}</span>
                    <span className="seg-arc">{fmt(partDur(part))}</span>
                    {made ? (
                      <button type="button" title={t('split.openTip')} className="btn small" onClick={() => openProject(made.projectId)}>{t('split.open')}</button>
                    ) : (
                      <span className="seg-state">{t('split.notCreated')}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showCheck && <DramaCheckModal project={project} update={update} onClose={() => setShowCheck(false)} />}
      <footer className="stage-footer">
        <button title={t('tip.continue')} className="btn primary big" disabled={!outline.length} onClick={goNext}>
          {t('s3.continue')}
        </button>
      </footer>
    </section>
  );
}

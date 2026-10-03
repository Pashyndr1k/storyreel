import { useAgentScope } from '../lib/agent/registry.js';
import { useGenerate } from '../lib/useGenerate.js';
import { stage3Prompt, durationOf } from '../lib/prompts.js';
import { uid } from '../lib/storage.js';
import { useI18n } from '../lib/i18n.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import { StyleChip } from '../components/StyleControls.jsx';
import DynamicsVisualizer from '../components/DynamicsVisualizer.jsx';
import { normalizePlan } from '../lib/dynamics.js';
import { Grip, Stars } from '../components/icons.jsx';
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

function Stage3Outline({ project, update, settings, goNext, onSettings, onProjectSettings, genLang, styles, scriptStyle, viewSwitch = null }) {
  const { t } = useI18n();
  const { busy: runBusy, error: runError, run } = useGenerate(settings);
  const [chunk, setChunk] = useState(null); // inline series: { a, b } episodes being outlined
  const [chunkErr, setChunkErr] = useState('');
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
        {outline.length > 0 && (
          <span className={`total-badge ${total > maxDuration ? 'over' : ''}`}>
            {t('s3.total', { t: fmt(total) })} / ≤{fmt(maxDuration)}
          </span>
        )}
        <span className="push-right" />
        <DynamicsVisualizer plan={project.dynamicsPlan} />
      </div>
      <ErrorNote error={error} onSettings={onSettings} />
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

      <footer className="stage-footer">
        <button title={t('tip.continue')} className="btn primary big" disabled={!outline.length} onClick={goNext}>
          {t('s3.continue')}
        </button>
      </footer>
    </section>
  );
}

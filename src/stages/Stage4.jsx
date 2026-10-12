import { useAgentScope } from '../lib/agent/registry.js';
import { syncShotAssets } from '../lib/storyAssets.js';
import { isShortDrama } from '../lib/shortDrama/rules.js';
import { rulesFor } from '../lib/shortDrama/engine.js';
import DramaCheckModal from '../components/DramaCheckModal.jsx';
import { SHOT_MIN_SEC, SHOT_MAX_SEC, SHOT_STEP_SEC, EXTENDED_SUBSHOTS } from '../lib/config.js';
import { takeOf, fitTakeDurations, autoTakeRefs } from '../lib/takes.js';
import { useRef, useState } from 'react';
import { Grip, Stars, Copy, Box } from '../components/icons.jsx';
import { useGenerate } from '../lib/useGenerate.js';
import { stage4Prompt } from '../lib/prompts.js';
import { uid } from '../lib/storage.js';
import { useI18n } from '../lib/i18n.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import StoryboardTimeline from '../components/StoryboardTimeline.jsx';
import { StyleChip } from '../components/StyleControls.jsx';
import DynamicsVisualizer from '../components/DynamicsVisualizer.jsx';
import Lightbox from '../components/Lightbox.jsx';
import SceneNav from '../components/SceneNav.jsx';
import ScriptExportModal from '../components/ScriptExportModal.jsx';
import SpatialModal from '../components/SpatialModal.jsx';
import BreakdownModeModal from '../components/BreakdownModeModal.jsx';
import { hasLayout, layoutEnabled } from '../lib/spatial/layout.js';
import { Download } from '../components/icons.jsx';

// The "Storyboard preview & timeline" section is hidden (2.12); the component
// and the frames already stored in projects are kept.
const SHOW_STORYBOARD = false;
import { blockForScene, densityRange } from '../lib/dynamics.js';

export function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function sceneStartTime(project, sceneId) {
  let t = 0;
  for (const s of project.outline) {
    if (s.id === sceneId) break;
    const shots = project.sceneDetails[s.id]?.shots;
    const d = shots?.length ? shots.reduce((a, x) => a + (x.duration || 0), 0) : 0;
    t += d || s.duration || 0;
  }
  return t;
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || lo));

// An extended breakdown returns { segments: [shot…] } per extended shot: the
// segments become consecutive shots and the whole becomes one take (groups).
const flattenShots = (rawShots) => {
  const shots = [];
  const groups = []; // arrays of indexes into `shots`
  for (const row of rawShots || []) {
    if (Array.isArray(row?.segments) && row.segments.length) {
      const segs = row.segments.slice(0, EXTENDED_SUBSHOTS.max);
      const idx = segs.map((s) => shots.push(s) - 1);
      if (idx.length > 1) groups.push(idx);
    } else if (row && typeof row === 'object') shots.push(row);
  }
  return { shots, groups };
};

const mapShots = (rawShots, range = { min: SHOT_MIN_SEC, max: SHOT_MAX_SEC }, project = null) =>
  (rawShots || []).map((s) => ({
    id: uid(),
    // Dynamics-plan blocks narrow the allowed range; the global 2-10s rule
    // is the outer bound either way.
    duration: clamp(clamp(s.duration_sec, range.min, range.max), SHOT_MIN_SEC, SHOT_MAX_SEC),
    shotType: s.shot_type || '',
    location: s.location || '',
    action: s.action || '',
    dialogue: s.dialogue || '',
    notes: s.notes || '',
    ...(rulesFor(project).BEATS.includes(String(s.beat || '').toLowerCase()) ? { beat: String(s.beat).toLowerCase() } : {}),
  }));

export default function Stage4({ project, update, settings, goNext, onSettings, onProjectSettings, genLang, styles, scriptStyle, imageStyle, library, libUpsert }) {
  const { t } = useI18n();
  const [lightbox, setLightbox] = useState(null); // full-size photo pop-up
  const [sceneId, setSceneId] = useState(project.outline[0]?.id || null);
  const [prog, setProg] = useState(null);
  const { busy, error, run, runBatch } = useGenerate(settings);

  const scene = project.outline.find((s) => s.id === sceneId) || project.outline[0];
  const shots = (scene && project.sceneDetails[scene.id]?.shots) || [];
  const [showExport, setShowExport] = useState(false);
  const [showLayout, setShowLayout] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const doneCount = project.outline.filter((s) => project.sceneDetails[s.id]?.shots?.length).length;
  const allDone = doneCount === project.outline.length && project.outline.length > 0;

  const blockOf = (s) => blockForScene(project.dynamicsPlan, project.outline.indexOf(s) + 1);

  const applyShots = (targetSceneId, rawShots, block, mode = 'normal') =>
    update((p) => {
      const { shots: flat, groups } = flattenShots(rawShots);
      // an extended shot's segments may be shorter than the rhythm block's
      // range asks of a normal shot — they are cuts inside one generation
      const range = mode === 'extended' ? { min: SHOT_MIN_SEC, max: SHOT_MAX_SEC } : block ? densityRange(block) : undefined;
      const mapped = mapShots(flat, range, project);
      // extended: each group becomes one H3 take (durations fitted to the
      // take ceiling), rendered with the cast / location / asset references
      const oldIds = new Set((p.sceneDetails[targetSceneId]?.shots || []).map((s) => s.id));
      const shotGroups = Object.fromEntries(Object.entries(p.shotGroups || {}).filter(([k, g]) => !oldIds.has(k) && !(g.shotIds || []).some((id) => oldIds.has(id))));
      const shotVideoModes = { ...(p.shotVideoModes || {}) };
      for (const id of oldIds) delete shotVideoModes[id];
      for (const idx of groups) {
        const members = idx.map((k) => mapped[k]);
        const fitted = fitTakeDurations(members.map((m) => m.duration), SHOT_MIN_SEC);
        members.forEach((m, k) => (m.duration = fitted[k]));
        shotGroups[members[0].id] = { shotIds: members.map((m) => m.id) };
        shotVideoModes[members[0].id] = 'mfr';
      }
      const sceneDetails = { ...p.sceneDetails, [targetSceneId]: { shots: mapped } };
      // the story's assets attach to the shots that name them
      const { patch } = syncShotAssets({ ...p, sceneDetails });
      const next = { sceneDetails, ...patch, shotGroups, shotVideoModes };
      // the references the take renders with (what exists now; Stage 5 fills the rest)
      if (groups.length) {
        const shotRefs = { ...(p.shotRefs || {}) };
        for (const id of oldIds) delete shotRefs[id];
        for (const g of Object.values(shotGroups)) {
          if (!mapped.some((m) => m.id === g.shotIds[0])) continue;
          const refs = autoTakeRefs({ ...p, ...next }, targetSceneId, g.shotIds, library || []);
          if (refs) shotRefs[g.shotIds[0]] = refs;
        }
        next.shotRefs = shotRefs;
      }
      return next;
    });

  // for the agent: one scene by id, or every scene, each returning its promise
  useAgentScope('stage4', {
    projectId: project.id,
    error,
    generateScene: (sid, mode = project.breakdownMode || 'normal') => {
      const sc = project.outline.find((x) => x.id === sid);
      const block = blockOf(sc);
      return run(stage4Prompt(project, { ...sc, number: project.outline.indexOf(sc) + 1 }, genLang, scriptStyle, block, mode), (data) => applyShots(sc.id, data.shots, block, mode));
    },
    generateAll: (mode = project.breakdownMode || 'normal') =>
      runBatch(
        project.outline,
        (s) => stage4Prompt(project, { ...s, number: project.outline.indexOf(s) + 1 }, genLang, scriptStyle, blockOf(s), mode),
        (s, data) => applyShots(s.id, data.shots, blockOf(s), mode),
        (a, b) => setProg(b ? { a, b } : null)
      ),
  });

  // Both breakdown buttons first ask: normal shots, or extended shots (complex
  // shots of 2–3 camera changes rendered as one H3 take). The answer is kept
  // on the project (breakdownMode) and used by the agent too.
  const [askMode, setAskMode] = useState(null); // 'scene' | 'all'
  const runGenerate = (mode) => {
    const block = blockOf(scene);
    run(
      stage4Prompt(project, { ...scene, number: project.outline.indexOf(scene) + 1 }, genLang, scriptStyle, block, mode),
      (data) => applyShots(scene.id, data.shots, block, mode)
    );
  };
  const runAll = (mode) => {
    let targets = project.outline.filter((s) => !project.sceneDetails[s.id]?.shots?.length);
    if (!targets.length) {
      if (!window.confirm(t('batch.confirmAll4'))) return;
      targets = project.outline;
    }
    runBatch(
      targets,
      (s) => stage4Prompt(project, { ...s, number: project.outline.indexOf(s) + 1 }, genLang, scriptStyle, blockOf(s), mode),
      (s, data) => applyShots(s.id, data.shots, blockOf(s), mode),
      (a, b) => setProg(b ? { a, b } : null)
    );
  };
  const generate = () => {
    if (shots.length && !window.confirm(t('s4.replaceConfirm'))) return;
    setAskMode('scene');
  };
  const processAll = () => setAskMode('all');
  const pickMode = (mode) => {
    const scope = askMode;
    setAskMode(null);
    if (mode !== (project.breakdownMode || 'normal')) update({ breakdownMode: mode });
    if (scope === 'scene') runGenerate(mode);
    else runAll(mode);
  };

  const setShots = (nextShots) =>
    update((p) => ({
      sceneDetails: { ...p.sceneDetails, [scene.id]: { shots: nextShots } },
    }));

  const updateShot = (id, patch) => setShots(shots.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeShot = (id) => setShots(shots.filter((s) => s.id !== id));
  // a copy of the shot's text and duration, placed right after it
  const duplicateShot = (id) => {
    const i = shots.findIndex((s) => s.id === id);
    if (i < 0) return;
    setShots([...shots.slice(0, i + 1), { ...shots[i], id: uid() }, ...shots.slice(i + 1)]);
  };

  const dragIdx = useRef(null);
  const [overIdx, setOverIdx] = useState(null);
  const moveShotTo = (from, to) => {
    const next = [...shots];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setShots(next);
  };
  const addShot = () =>
    setShots([
      ...shots,
      { id: uid(), duration: 4, shotType: '', location: '', action: '', dialogue: '', notes: '' },
    ]);

  if (!project.outline.length) {
    return (
      <section className="stage">
        <h2 title={t('s4.desc')}>{t('s4.title')}</h2>
        <div className="note warn">{t('s4.needOutline')}</div>
      </section>
    );
  }

  const sceneStart = sceneStartTime(project, scene.id);
  const sceneTotal = shots.reduce((a, s) => a + (s.duration || 0), 0);
  let cursor = sceneStart;

  return (
    <section className="stage">
      <div className="stage-head-row">
        <h2
          className="stage-h2"
          data-tip={`${t('s4.desc')} ${t('s4.progress', { a: doneCount, b: project.outline.length })}`}
        >
          {t('s4.title')}
        </h2>
      </div>

      <SceneNav
        outline={project.outline}
        currentId={scene.id}
        isDone={(s) => !!project.sceneDetails[s.id]?.shots?.length}
        onSelect={setSceneId}
      />

      <div className="context-box static">
        <strong>{t('s4.scene')} {project.outline.indexOf(scene) + 1}: {scene.title}</strong> ·{' '}
        {t('s4.startsAt', { t: fmt(sceneStart) })} · {t('s4.target', { d: scene.duration })}
        {shots.length > 0 && <> · {t('s4.current', { d: sceneTotal })}</>}
        <p>{scene.summary}</p>
      </div>

      <div className="row">
        <button title={t('tip.s4Generate')} className="btn primary" disabled={busy} onClick={generate}>
          {!shots.length && <Stars size={14} />} {busy && !prog ? t('gen.generating') : shots.length ? t('s4.regenerate') : t('s4.generate')}
        </button>
        <button title={t('tip.batch4')} className="btn" disabled={busy} onClick={processAll}>
          {t('batch.run4')}
        </button>
        {prog && (
          <span className="total-badge" title={t('ind.batchProgress')}>{t('batch.progress', { a: prog.a, b: prog.b })}</span>
        )}
        {isShortDrama(project) && (
          <button type="button" className="btn" title={t('drama.checkBtnTip')} disabled={!shots.length} onClick={() => setShowCheck(true)}>{t('drama.checkBtn')}</button>
        )}
        {layoutEnabled(project) && (
          <button title={shots.length ? t('tip.spOpen') : t('sp.noShots')} className={`btn ${scene && hasLayout(project, scene.id) ? 'has-layout' : ''}`} disabled={!shots.length} onClick={() => setShowLayout(true)}>
            <Box size={14} /> {t('sp.button')}
          </button>
        )}
        <button title={allDone ? t('tip.sxOpen') : t('sx.notReady')} className="btn" disabled={!allDone} onClick={() => setShowExport(true)}>
          <Download size={14} /> {t('sx.button')}
        </button>
        <span className="push-right" />
        <DynamicsVisualizer plan={project.dynamicsPlan} />
      </div>
      <ErrorNote error={error} onSettings={onSettings} />

      {SHOW_STORYBOARD && shots.length > 0 && (
        <StoryboardTimeline
          project={project}
          scene={scene}
          shots={shots}
          settings={settings}
          onReorder={moveShotTo}
          onDuration={(id, d) => updateShot(id, { duration: clamp(d, 2, 10) })}
          onFrames={(frames) => update((p) => ({ storyboards: { ...p.storyboards, ...frames } }))}
          onRefFrames={(frames) => update((p) => ({ referenceFrames: { ...(p.referenceFrames || {}), ...frames } }))}
          imageStyle={imageStyle}
          onSettings={onSettings}
        />
      )}

      {shots.map((shot, i) => {
        const start = cursor;
        cursor += shot.duration || 0;
        return (
          <div
            key={shot.id}
            className={`shot-card ${overIdx === i ? 'drag-over' : ''}`}
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
              if (from != null && from !== i) moveShotTo(from, i);
            }}
          >
            <div className="shot-head">
              <strong>{t('s4.shot', { n: i + 1 })}</strong>
              {(() => {
                // an extended shot: its segments share one H3 take
                const g = takeOf(project, shot.id);
                if (!g) return null;
                const n = Object.keys(project.shotGroups || {}).indexOf(g.shotIds[0]) + 1;
                return <span className="take-badge" title={t('s4.takeTip')}>{t('s4.takeBadge', { n })}{g.shotIds[0] === shot.id ? '' : ` · ${g.shotIds.indexOf(shot.id) + 1}/${g.shotIds.length}`}</span>;
              })()}
              <span className="timecode">{fmt(start)} – {fmt(cursor)}</span>
              <StyleChip project={project} styles={styles} cat="script" onClick={onProjectSettings} />
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
                <button title={t('tip.dupShot')} aria-label={t('tip.dupShot')} className="btn tiny shot-dup" onClick={() => duplicateShot(shot.id)}>
                  <Copy size={13} />
                </button>
                <button title={t('tip.removeShot')} className="btn danger tiny" onClick={() => removeShot(shot.id)}>✕</button>
              </div>
            </div>
            <div className="shot-grid">
              <div className="field small-field">
                <label>{t('s4.duration')}</label>
                <input
                  type="number"
                  min={SHOT_MIN_SEC}
                  max={SHOT_MAX_SEC}
                  step={SHOT_STEP_SEC}
                  value={shot.duration}
                  onChange={(e) => updateShot(shot.id, { duration: clamp(e.target.value, 2, 10) })}
                />
              </div>
              <div className="field">
                <label>{t('s4.shotType')}</label>
                <input
                  value={shot.shotType}
                  placeholder={t('s4.shotTypePh')}
                  onChange={(e) => updateShot(shot.id, { shotType: e.target.value })}
                />
              </div>
              <div className="field grow2">
                <label>{t('s4.location')}</label>
                <input
                  value={shot.location}
                  placeholder={t('s4.locationPh')}
                  onChange={(e) => updateShot(shot.id, { location: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>{t('s4.action')}</label>
              <AutoTextarea minRows={2} value={shot.action} onChange={(e) => updateShot(shot.id, { action: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('s4.dialogue')}</label>
              <AutoTextarea
                minRows={2}
                value={shot.dialogue}
                placeholder={t('s4.dialoguePh')}
                onChange={(e) => updateShot(shot.id, { dialogue: e.target.value })}
              />
            </div>
            <div className="field">
              <label>{t('s4.notes')}</label>
              <input value={shot.notes} onChange={(e) => updateShot(shot.id, { notes: e.target.value })} />
            </div>
          </div>
        );
      })}

      {shots.length > 0 && (
        <div className="row">
          <button title={t('tip.addShot')} className="btn small" onClick={addShot}>{t('s4.addShot')}</button>
        </div>
      )}

      <footer className="stage-footer">
        {!allDone && <span className="hint">{t('s4.hint', { n: project.outline.length })}</span>}
        <button title={t('tip.continue')} className="btn primary big" disabled={!allDone} onClick={goNext}>
          {t('s4.continue')}
        </button>
      </footer>
      <Lightbox item={lightbox} onClose={() => setLightbox(null)} />
      {showExport && <ScriptExportModal project={project} onClose={() => setShowExport(false)} />}
      {showCheck && <DramaCheckModal project={project} update={update} onClose={() => setShowCheck(false)} />}
      {askMode && <BreakdownModeModal value={project.breakdownMode || 'normal'} scope={askMode} onPick={pickMode} onClose={() => setAskMode(null)} />}
      {showLayout && scene && <SpatialModal project={project} update={update} scene={scene} settings={settings} onClose={() => setShowLayout(false)} />}
    </section>
  );
}

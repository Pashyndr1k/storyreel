import { useRef, useState } from 'react';
import { generateJSON, textKeyError } from '../lib/claude.js';
import { seriesArcsPrompt, seriesEpisodesPrompt } from '../lib/prompts.js';
import {
  clampEpisodes,
  clampSegment,
  normalizeArcs,
  arcChunks,
  planSegments,
  buildSegmentProject,
  inlineSeriesPart,
  isSeriesInline,
  SEGMENT_MIN,
  SEGMENT_MAX,
  SEGMENT_DEFAULT,
  episodeRange,
} from '../lib/series.js';
import { useI18n } from '../lib/i18n.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import { StyleChip } from '../components/StyleControls.jsx';
import { Stars, Chevron, RestoreIcon } from '../components/icons.jsx';

// Stage 3 of a series master project: the series plan. The story is broken
// into main sections (each closing on an intermediate finale), every section
// into episodes (each closing on a cliffhanger), and the finished plan is
// split into production projects of 5–10 episodes.
export default function Stage3Series({ project, update, settings, onSettings, onProjectSettings, genLang, styles, scriptStyle, addProjects, openProject, projectExists, viewSwitch = null, onKept = null }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null); // { a, b } episode-writing calls
  const [error, setError] = useState('');
  const [open, setOpen] = useState(() => new Set([0])); // unfolded sections (by index)
  const cancel = useRef(false);
  const projectRef = useRef(project);
  projectRef.current = project;

  const total = clampEpisodes(project.episodeCount);
  const plan = project.seriesPlan || null;
  const arcs = plan?.arcs || [];
  const episodes = plan?.episodes || [];
  const byNumber = new Map(episodes.map((e) => [e.number, e]));
  const planTotal = arcs.length ? arcs[arcs.length - 1].to : 0;
  const missing = arcs.length ? Array.from({ length: planTotal }, (_, i) => i + 1).filter((n) => !byNumber.has(n)).length : 0;
  const complete = arcs.length > 0 && missing === 0;
  const countChanged = arcs.length > 0 && planTotal !== total;

  const patchPlan = (fn) => update((p) => ({ seriesPlan: fn(p.seriesPlan || { arcs: [], episodes: [], segmentSize: SEGMENT_DEFAULT, segments: [] }) }));
  const updateArc = (id, patch) => patchPlan((pl) => ({ ...pl, arcs: pl.arcs.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const updateEpisode = (number, patch) =>
    patchPlan((pl) => ({ ...pl, episodes: pl.episodes.map((e) => (e.number === number ? { ...e, ...patch } : e)) }));

  // mode: 'all' — sections, then every episode; 'missing' — only episodes not
  // written yet; an arc id — rewrite that section's episodes.
  const run = async (mode) => {
    const keyErr = textKeyError(settings);
    if (keyErr) return setError(keyErr);
    if (mode === 'all' && arcs.length && !window.confirm(t('ser.replaceConfirm'))) return;
    cancel.current = false;
    setBusy(true);
    setError('');
    try {
      let curArcs = projectRef.current.seriesPlan?.arcs || [];
      let acc = [...(projectRef.current.seriesPlan?.episodes || [])];
      if (mode === 'all') {
        const data = await generateJSON(settings, seriesArcsPrompt(projectRef.current, genLang, scriptStyle));
        curArcs = normalizeArcs(data.arcs, total);
        acc = [];
        patchPlan((pl) => ({ ...pl, arcs: curArcs, episodes: [] }));
        setOpen(new Set([0]));
      }
      const have = new Set(acc.map((e) => e.number));
      const todo = [];
      for (const arc of curArcs) {
        for (const ch of arcChunks(arc)) {
          const full = Array.from({ length: ch.to - ch.from + 1 }, (_, i) => ch.from + i).every((n) => have.has(n));
          if (mode === arc.id || (mode !== arc.id && !full && (mode === 'all' || mode === 'missing'))) todo.push({ arc, ...ch });
        }
      }
      for (let i = 0; i < todo.length; i++) {
        if (cancel.current) break;
        setProg({ a: i, b: todo.length });
        const { arc, from, to } = todo[i];
        // continuity: the two episodes right before this chunk
        const previous = acc.filter((e) => e.number < from).sort((a, b) => a.number - b.number).slice(-2);
        const fresh = projectRef.current;
        const data = await generateJSON(
          settings,
          seriesEpisodesPrompt(fresh, genLang, scriptStyle, { arcs: fresh.seriesPlan?.arcs || curArcs, arc, from, to, previous })
        );
        const got = Array.isArray(data.episodes) ? data.episodes : [];
        const written = [];
        for (let n = from; n <= to; n++) {
          const e = got.find((x) => Number(x?.number) === n) || got[n - from];
          if (!e) continue;
          written.push({
            number: n,
            title: String(e.title || '').trim(),
            summary: String(e.summary || '').trim(),
            cliffhanger: String(e.cliffhanger || '').trim(),
          });
        }
        if (!written.length) throw new Error(t('ser.noEpisodes', { a: from, b: to }));
        const nums = new Set(written.map((e) => e.number));
        acc = [...acc.filter((e) => !nums.has(e.number)), ...written].sort((a, b) => a.number - b.number);
        const snapshot = acc;
        patchPlan((pl) => ({ ...pl, episodes: snapshot }));
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
      setProg(null);
    }
  };

  // ---- split into production projects
  const segSize = clampSegment(plan?.segmentSize);
  const segs = arcs.length ? planSegments(arcs, planTotal, segSize) : [];
  const createdFor = (s) => (plan?.segments || []).find((x) => x.from === s.from && x.to === s.to && projectExists?.(x.projectId));
  const pendingSegs = segs.filter((s) => !createdFor(s));
  const createSegments = () => {
    if (!complete || !pendingSegs.length) return;
    const made = pendingSegs.map((s) => ({ seg: s, project: buildSegmentProject(project, s, t('ser.epRange', { a: s.from, b: s.to })) }));
    addProjects(made.map((m) => m.project));
    patchPlan((pl) => ({
      ...pl,
      segments: [
        ...(pl.segments || []).filter((x) => projectExists?.(x.projectId)),
        ...made.map((m) => ({ from: m.seg.from, to: m.seg.to, projectId: m.project.id })),
      ],
    }));
  };

  // ---- or keep every episode in this project
  const inline = isSeriesInline(project);
  const keepHere = () => {
    if (!complete) return;
    const minutes = Math.round((planTotal * (episodeRange(project).min + episodeRange(project).max)) / 2 / 60);
    if (!window.confirm(t('ser.keepConfirm', { n: planTotal, m: minutes }))) return;
    update({ seriesPart: inlineSeriesPart(project) });
    onKept?.();
  };
  const unkeep = () => {
    if (!window.confirm(t('ser.unkeepConfirm'))) return;
    update({ seriesPart: null });
  };

  const toggle = (i) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const mainLabel = busy
    ? prog
      ? t('ser.writing', { a: prog.a + 1, b: prog.b })
      : t('gen.generating')
    : !arcs.length
      ? t('ser.generate')
      : missing
        ? t('ser.generateMissing')
        : t('ser.regenerate');

  return (
    <section className="stage">
      <div className="stage-head-row">
        <h2 className="stage-h2" data-tip={t('ser.desc')}>{t('ser.title')}</h2>
      </div>
      {viewSwitch}

      <div className="row">
        <button
          title={t('tip.serGenerate')}
          className="btn primary"
          disabled={busy || !project.storyline?.synopsis?.trim()}
          onClick={() => run(!arcs.length ? 'all' : missing ? 'missing' : 'all')}
        >
          {!arcs.length && <Stars size={14} />} {mainLabel}
        </button>
        {busy && (
          <button title={t('tip.serStop')} className="btn" onClick={() => { cancel.current = true; }}>
            {t('ser.stop')}
          </button>
        )}
        <StyleChip project={project} styles={styles} cat="script" onClick={onProjectSettings} />
        <span className="total-badge" title={t('ind.serEpisodes')}>
          {t('ser.badge', { n: total, a: episodeRange(project).min, b: episodeRange(project).max })}
        </span>
        {arcs.length > 0 && (
          <span className={`total-badge ${missing ? 'over' : ''}`} title={t('ind.serWritten')}>
            {t('ser.written', { a: planTotal - missing, b: planTotal })}
          </span>
        )}
      </div>
      {!project.storyline?.synopsis?.trim() && <div className="note warn">{t('ser.needStoryline')}</div>}
      {countChanged && <div className="note warn">{t('ser.countChanged', { a: planTotal, b: total })}</div>}
      <ErrorNote error={error} onSettings={onSettings} />

      {arcs.map((arc, i) => {
        const isOpen = open.has(i);
        const arcEpisodes = episodes.filter((e) => e.number >= arc.from && e.number <= arc.to);
        return (
          <div key={arc.id} className="arc-card">
            <div className="arc-head">
              <button
                type="button"
                className={`prompt-fold ${isOpen ? 'open' : ''}`}
                title={isOpen ? t('ser.fold') : t('ser.unfold')}
                aria-label={isOpen ? t('ser.fold') : t('ser.unfold')}
                aria-expanded={isOpen}
                onClick={() => toggle(i)}
              >
                <Chevron size={14} />
              </button>
              <div className="scene-num" title={t('ind.serSection')}>{i + 1}</div>
              <input
                className="grow"
                value={arc.title}
                placeholder={t('ser.arcTitlePh')}
                onChange={(e) => updateArc(arc.id, { title: e.target.value })}
              />
              <span className="total-badge" title={t('ind.serRange')}>{t('ser.epRange', { a: arc.from, b: arc.to })}</span>
              <button
                type="button"
                className="icon-btn sq36"
                title={t('tip.serArcRegen')}
                aria-label={t('tip.serArcRegen')}
                disabled={busy}
                onClick={() => {
                  if (!arcEpisodes.length || window.confirm(t('ser.arcConfirm', { a: arc.from, b: arc.to }))) run(arc.id);
                }}
              >
                <RestoreIcon size={15} />
              </button>
            </div>
            {isOpen && (
              <div className="arc-body">
                <label>{t('ser.arcSummary')}</label>
                <AutoTextarea minRows={2} value={arc.summary} onChange={(e) => updateArc(arc.id, { summary: e.target.value })} />
                <label title={t('tip.serFinale')}>{t('ser.arcFinale')}</label>
                <AutoTextarea minRows={1} value={arc.finale} onChange={(e) => updateArc(arc.id, { finale: e.target.value })} />

                {arcEpisodes.length === 0 && <p className="hint">{t('ser.noEpisodesYet')}</p>}
                {arcEpisodes.map((ep) => (
                  <div key={ep.number} className="scene-row ep-row">
                    <div className="scene-num" title={t('ind.serEpisode')}>{ep.number}</div>
                    <div className="scene-fields">
                      <div className="row">
                        <input
                          className="grow"
                          value={ep.title}
                          placeholder={t('ser.epTitlePh')}
                          onChange={(e) => updateEpisode(ep.number, { title: e.target.value })}
                        />
                      </div>
                      <AutoTextarea
                        minRows={2}
                        value={ep.summary}
                        placeholder={t('ser.epSummaryPh')}
                        onChange={(e) => updateEpisode(ep.number, { summary: e.target.value })}
                      />
                      <label className="ep-cliff-label" title={t('tip.serCliff')}>{t('ser.cliffhanger')}</label>
                      <AutoTextarea
                        minRows={1}
                        value={ep.cliffhanger}
                        placeholder={t('ser.cliffPh')}
                        onChange={(e) => updateEpisode(ep.number, { cliffhanger: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {arcs.length > 0 && (
        <div className="seg-panel">
          <h3 title={t('ser.prodHint')}>{t('ser.prodTitle')}</h3>
          <p className="hint">{t('ser.prodHint')}</p>
          {!complete && <p className="hint">{t('ser.splitNeedsPlan')}</p>}

          {/* option 1: everything in this project */}
          <div className="prod-option">
            <h4 title={t('ser.keepHint')}>{t('ser.keepTitle')}</h4>
            <p className="hint">{inline ? t('ser.keptNote') : t('ser.keepHint')}</p>
            <div className="row">
              {inline ? (
                <button title={t('tip.serUnkeep')} className="btn" onClick={unkeep}>{t('ser.unkeep')}</button>
              ) : (
                <button title={t('tip.serKeep')} className="btn primary" disabled={busy || !complete} onClick={keepHere}>{t('ser.keepBtn')}</button>
              )}
            </div>
          </div>

          {/* option 2: separate projects of 5–10 episodes */}
          <div className="prod-option">
          <h4 title={t('ser.splitHint')}>{t('ser.splitTitle')}</h4>
          <p className="hint">{t('ser.splitHint')}</p>
          <div className="row">
            <label className="seg-size">
              <span>{t('ser.segSize')}</span>
              <select
                title={t('tip.serSegSize')}
                value={segSize}
                onChange={(e) => patchPlan((pl) => ({ ...pl, segmentSize: clampSegment(e.target.value) }))}
              >
                {Array.from({ length: SEGMENT_MAX - SEGMENT_MIN + 1 }, (_, k) => SEGMENT_MIN + k).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <button
              title={t('tip.serCreate')}
              className="btn primary"
              disabled={busy || !complete || !pendingSegs.length}
              onClick={createSegments}
            >
              {t('ser.createProjects', { n: pendingSegs.length })}
            </button>
          </div>
          <div className="seg-list">
            {segs.map((s) => {
              const made = createdFor(s);
              return (
                <div key={`${s.from}-${s.to}`} className={`seg-row ${made ? 'made' : ''}`}>
                  <span className="seg-range">{t('ser.epRange', { a: s.from, b: s.to })}</span>
                  <span className="seg-count" title={t('ind.serSegCount')}>{s.to - s.from + 1}</span>
                  <span className="seg-arc" title={s.arcTitle}>{s.arcTitle}</span>
                  {made ? (
                    <button title={t('tip.serOpen')} className="btn small" onClick={() => openProject(made.projectId)}>
                      {t('ser.open')}
                    </button>
                  ) : (
                    <span className="seg-state">{t('ser.notCreated')}</span>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      <footer className="stage-footer">
        <p className="hint">{inline ? t('ser.keptFooter') : t('ser.masterNote')}</p>
      </footer>
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { generateJSON, textKeyError } from '../lib/claude.js';
import { fileToResizedDataURL } from '../lib/images.js';
import NovelScreen from '../components/NovelScreen.jsx';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import { LAYOUTS, layoutOf, screenPanels, captionLines } from '../lib/novel/layout.js';
import { screenOf, visiblePanels, feedOf, newBubble } from '../lib/novel/model.js';
import { novelPlanSpec, screensFromPlan, lostLines, panelRatio } from '../lib/novel/plan.js';
import { panelImageRequest, runPanelImage, imageKeyError } from '../lib/novel/images.js';
import { exportComicFeed } from '../lib/novel/render.js';
import { Upload, Trash, Stars, Download } from '../components/icons.jsx';

const FEED_W = 232; // feed thumbnails
const EDIT_W = 400; // the editable preview

// Mini diagram of a layout template for the composition tool.
function LayoutGlyph({ id }) {
  const s = 0.05;
  return (
    <svg width={1080 * s} height={1920 * s} viewBox="0 0 1080 1920" className="nv-glyph" aria-hidden="true">
      <rect x="0" y="0" width="1080" height="1920" fill="none" stroke="currentColor" strokeWidth="30" opacity="0.35" />
      {screenPanels(id).map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="currentColor" opacity="0.55" />
          <rect x={b.cap.x} y={b.cap.y + 18} width={b.cap.w * 0.6} height="34" fill="currentColor" opacity="0.35" />
        </g>
      ))}
    </svg>
  );
}

// Stage 5 of a graphic novel: the vertical feed of comic screens on the left
// (one screen per shot, scrolled like the finished comic), the composition
// tool, the panel prompts, images, captions and balloons on the right.
export default function NovelStage({ project, update, settings, genLang, imageStyle, imageStylePlus, onSettings }) {
  const { t } = useI18n();
  const feed = useMemo(() => feedOf(project), [project]);
  const [selId, setSelId] = useState(() => feed[0]?.shot.id || null);
  const [selPanel, setSelPanel] = useState(0);
  const [planning, setPlanning] = useState(null); // scene id or shot id
  const [drawing, setDrawing] = useState(() => new Set()); // panel ids
  const [queue, setQueue] = useState(null); // { done, total } while a scene draws
  const stopRef = useRef(false);
  const [error, setError] = useState(null);
  const [exportMsg, setExportMsg] = useState('');
  const projectRef = useRef(project);
  projectRef.current = project;
  const images = project.panelImages || {};

  const sel = feed.find((x) => x.shot.id === selId) || feed[0] || null;
  useEffect(() => {
    if (sel && sel.shot.id !== selId) setSelId(sel.shot.id);
  }, [sel, selId]);
  const thumbRefs = useRef({});

  if (!feed.length) return <div className="stage novel-empty"><p className="hint">{t('nv.noShots')}</p></div>;

  const layoutIds = LAYOUTS.map((l) => l.id);
  const screen = sel.screen;
  const panels = visiblePanels(screen);
  const panelIdx = Math.min(selPanel, panels.length - 1);

  // ---- writes -----------------------------------------------------------
  const setScreen = (shotId, fn) =>
    update((p) => {
      const shot = (p.outline || []).flatMap((sc) => p.sceneDetails?.[sc.id]?.shots || []).find((s) => s.id === shotId);
      if (!shot) return {};
      const cur = screenOf(p, shot);
      // the panels the layout shows are stored, with their stable ids
      const vis = visiblePanels(cur);
      const all = [...vis, ...(cur.panels || []).slice(vis.length)];
      const next = fn({ ...cur, panels: all });
      return { novel: { ...(p.novel || {}), screens: { ...(p.novel?.screens || {}), [shotId]: next } } };
    });
  const setPanel = (shotId, i, patch) =>
    setScreen(shotId, (s) => ({ ...s, panels: s.panels.map((p, k) => (k === i ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p)) }));
  const setBubble = (shotId, i, id, patch) =>
    setPanel(shotId, i, (p) => ({ bubbles: p.bubbles.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  const setImage = (panelId, url) =>
    update((p) => {
      const next = { ...(p.panelImages || {}) };
      if (url) next[panelId] = url;
      else delete next[panelId];
      return { panelImages: next };
    });

  // ---- the composition planner ------------------------------------------
  const plan = async (scene, shots, key) => {
    const keyErr = textKeyError(settings);
    if (keyErr) return setError(keyErr);
    setPlanning(key);
    setError(null);
    try {
      const cur = projectRef.current;
      const data = await generateJSON(settings, novelPlanSpec(cur, scene, shots, genLang));
      const screens = screensFromPlan(cur, scene, shots, data);
      if (!Object.keys(screens).length) throw new Error(t('nv.planEmpty'));
      update((p) => ({ novel: { ...(p.novel || {}), screens: { ...(p.novel?.screens || {}), ...screens } } }));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setPlanning(null);
    }
  };

  // ---- panel images -------------------------------------------------------
  const drawPanel = async (shotId, i) => {
    const cur = projectRef.current;
    const item = feedOf(cur).find((x) => x.shot.id === shotId);
    if (!item) return;
    const p = visiblePanels(item.screen)[i];
    if (!p?.prompt.trim()) return setError(t('nv.needPrompt'));
    const keyErr = imageKeyError(settings);
    if (keyErr) return setError(keyErr);
    setDrawing((s) => new Set(s).add(p.id));
    setError(null);
    try {
      const screenNow = { ...item.screen, panels: visiblePanels(item.screen) };
      const req = panelImageRequest({ project: cur, scene: item.scene, shot: item.shot, screen: screenNow, index: i, imageStyle, imageStylePlus, settings });
      const url = await runPanelImage(settings, req, `${(cur.title || 'comic').slice(0, 24)}_sc${item.sceneIndex + 1}_shot${item.shotIndex + 1}_panel${i + 1}`);
      // the panel may have been re-planned meanwhile: the image follows its id
      setImage(p.id, url);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setDrawing((s) => {
        const n = new Set(s);
        n.delete(p.id);
        return n;
      });
    }
  };
  const drawMany = async (items) => {
    const jobs = items.flatMap((it) => visiblePanels(it.screen).map((p, i) => ({ shotId: it.shot.id, i, p }))).filter((j) => j.p.prompt.trim() && !(projectRef.current.panelImages || {})[j.p.id]);
    if (!jobs.length) return setError(t('nv.nothingToDraw'));
    stopRef.current = false;
    setQueue({ done: 0, total: jobs.length });
    for (let k = 0; k < jobs.length; k++) {
      if (stopRef.current) break;
      await drawPanel(jobs[k].shotId, jobs[k].i);
      setQueue({ done: k + 1, total: jobs.length });
    }
    setQueue(null);
  };
  const upload = async (panelId, file) => {
    try {
      setImage(panelId, await fileToResizedDataURL(file, 1600, 0.9));
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  const doExport = async () => {
    setError(null);
    try {
      const res = await exportComicFeed(projectRef.current, settings, projectRef.current.panelImages || {}, (a, b) => setExportMsg(t('nv.exporting', { a, b })));
      setExportMsg(res.dir ? t('nv.exported', { n: res.count, dir: res.dir }) : t('nv.exportedZip', { n: res.count }));
    } catch (e) {
      setExportMsg('');
      setError(e.message || String(e));
    }
  };

  const busy = !!planning || !!queue;
  const sceneOf = sel.scene;
  const sceneItems = feed.filter((x) => x.scene.id === sceneOf.id);
  const drawn = feed.reduce((a, x) => a + visiblePanels(x.screen).filter((p) => images[p.id]).length, 0);
  const totalPanels = feed.reduce((a, x) => a + layoutOf(x.screen.layout).panels, 0);
  const lost = lostLines(sel.shot, { panels });

  const selectScreen = (shotId) => {
    setSelId(shotId);
    setSelPanel(0);
  };

  return (
    <div className="stage novel-stage">
      <div className="nv-toolbar">
        <span className="nv-progress" title={t('nv.progressTip')}>{t('nv.progress', { a: drawn, b: totalPanels })}</span>
        <button className="btn small" disabled={busy} title={t('nv.planSceneTip')} onClick={() => plan(sceneOf, sceneItems.map((x) => x.shot), sceneOf.id)}>
          <Stars size={14} /> {planning === sceneOf.id ? t('nv.planning') : t('nv.planScene')}
        </button>
        {queue ? (
          <button className="btn small" title={t('nv.stopTip')} onClick={() => (stopRef.current = true)}>
            {t('nv.stop')} · {queue.done}/{queue.total}
          </button>
        ) : (
          <button className="btn small" disabled={busy} title={t('nv.drawSceneTip')} onClick={() => drawMany(sceneItems)}>
            {t('nv.drawScene')}
          </button>
        )}
        <button className="btn small primary" disabled={busy} title={t('nv.exportTip')} onClick={doExport}>
          <Download size={14} /> {t('nv.export')}
        </button>
        {exportMsg && <span className="nv-export-msg">{exportMsg}</span>}
      </div>
      <ErrorNote error={error} onSettings={onSettings} />

      <div className="nv-body">
        {/* the vertical feed: every screen in reading order */}
        <aside className="nv-feed" title={t('nv.feedTip')}>
          {feed.map((x, k) => {
            const head = k === 0 || feed[k - 1].scene.id !== x.scene.id;
            const vis = visiblePanels(x.screen);
            const done = vis.filter((p) => images[p.id]).length;
            return (
              <div key={x.shot.id}>
                {head && (
                  <div className="nv-scene-head" title={x.scene.summary || ''}>
                    {t('nv.sceneHead', { n: x.sceneIndex + 1 })} · {x.scene.title}
                  </div>
                )}
                <button
                  ref={(el) => (thumbRefs.current[x.shot.id] = el)}
                  className={`nv-thumb${x.shot.id === sel.shot.id ? ' sel' : ''}`}
                  title={t('nv.screenTip', { n: x.shotIndex + 1 })}
                  onClick={() => selectScreen(x.shot.id)}
                >
                  <NovelScreen screen={x.screen} images={images} width={FEED_W} idPrefix={`f${k}`} />
                  <span className="nv-thumb-meta">
                    <span>{t('nv.screen', { n: `${x.sceneIndex + 1}.${x.shotIndex + 1}` })}</span>
                    <span className={x.screen.planned ? '' : 'nv-unplanned'}>{x.screen.planned ? `${done}/${vis.length}` : t('nv.notPlanned')}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </aside>

        {/* the selected screen */}
        <section className="nv-inspector">
          <div className="nv-insp-head">
            <h3 title={sel.scene.title}>
              {t('nv.screen', { n: `${sel.sceneIndex + 1}.${sel.shotIndex + 1}` })}
            </h3>
            <button className="btn small" disabled={busy} title={t('nv.planScreenTip')} onClick={() => plan(sel.scene, [sel.shot], sel.shot.id)}>
              <Stars size={14} /> {planning === sel.shot.id ? t('nv.planning') : t('nv.planScreen')}
            </button>
            <button className="btn small" disabled={busy} title={t('nv.drawScreenTip')} onClick={() => drawMany([sel])}>
              {t('nv.drawScreen')}
            </button>
          </div>

          <div className="nv-script" title={t('nv.scriptTip')}>
            <span className="nv-label">{t('nv.script')}</span>
            <p>{sel.shot.action}</p>
            {sel.shot.dialogue && <p className="nv-script-lines">{sel.shot.dialogue}</p>}
          </div>

          {/* the composition tool */}
          <div className="nv-layouts" role="radiogroup" aria-label={t('nv.layout')} title={t('nv.layoutTip')}>
            <span className="nv-label">{t('nv.layout')}</span>
            <div className="nv-layout-row">
              {layoutIds.map((id) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={screen.layout === id}
                  className={`nv-layout${screen.layout === id ? ' on' : ''}`}
                  title={t(`nv.layoutHint_${id}`)}
                  onClick={() => setScreen(sel.shot.id, (s) => ({ ...s, layout: id }))}
                >
                  <LayoutGlyph id={id} />
                  <strong>{t(`nv.layout_${id}`)}</strong>
                  <span>{t(`nv.layoutHint_${id}`)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="nv-edit">
            <div className="nv-preview">
              <NovelScreen
                screen={screen}
                images={images}
                width={EDIT_W}
                editable
                selected={panelIdx}
                idPrefix="ed"
                emptyLabel={(i) => (drawing.has(panels[i].id) ? t('nv.busy') : t('nv.empty', { n: i + 1 }))}
                onSelectPanel={setSelPanel}
                onMoveBubble={(i, id, x, y) => setBubble(sel.shot.id, i, id, { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 })}
              />
              <p className="hint">{t('nv.dragHint')}</p>
            </div>

            <div className="nv-panels">
              <div className="nv-panel-tabs" role="tablist">
                {panels.map((p, i) => (
                  <button key={p.id} role="tab" aria-selected={i === panelIdx} className={`nv-tab${i === panelIdx ? ' on' : ''}`} title={t('nv.panelTip', { n: i + 1 })} onClick={() => setSelPanel(i)}>
                    {t('nv.panel', { n: i + 1 })}
                    {images[p.id] ? ' ●' : ''}
                  </button>
                ))}
              </div>
              {(() => {
                const i = panelIdx;
                const p = panels[i];
                const box = screenPanels(screen.layout)[i];
                const cut = captionLines(p.caption, box.cap.w).cut;
                const isBusy = drawing.has(p.id);
                return (
                  <div className="nv-panel-form" key={p.id}>
                    <div className="nv-img-row">
                      <button className="btn small primary" disabled={isBusy || !!queue} title={t(images[p.id] ? 'nv.redrawTip' : 'nv.drawTip')} onClick={() => drawPanel(sel.shot.id, i)}>
                        {isBusy ? t('nv.busy') : images[p.id] ? t('nv.redraw') : t('nv.draw')}
                      </button>
                      <label className="icon-btn" title={t('nv.uploadTip')}>
                        <Upload size={15} />
                        <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(p.id, e.target.files[0])} />
                      </label>
                      {images[p.id] && (
                        <button className="icon-btn" title={t('nv.clearImgTip')} aria-label={t('nv.clearImgTip')} onClick={() => setImage(p.id, null)}>
                          <Trash size={15} />
                        </button>
                      )}
                      <span className="hint" title={t('nv.ratioTip')}>{t('nv.ratio', { r: panelRatio(screen.layout, i) })}</span>
                    </div>

                    <label title={t('nv.framingTip')}>{t('nv.framing')}</label>
                    <input value={p.framing} onChange={(e) => setPanel(sel.shot.id, i, { framing: e.target.value })} title={t('nv.framingTip')} />

                    <label title={t('nv.charactersTip')}>{t('nv.characters')}</label>
                    <input
                      value={(p.characters || []).join(', ')}
                      onChange={(e) => setPanel(sel.shot.id, i, { characters: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
                      title={t('nv.charactersTip')}
                    />

                    <label title={t('nv.promptTip')}>{t('nv.prompt')}</label>
                    <AutoTextarea minRows={4} value={p.prompt} onChange={(e) => setPanel(sel.shot.id, i, { prompt: e.target.value })} title={t('nv.promptTip')} />

                    <label title={t('nv.captionTip')}>{t('nv.caption')}</label>
                    <input value={p.caption} onChange={(e) => setPanel(sel.shot.id, i, { caption: e.target.value })} title={t('nv.captionTip')} />
                    {cut && <p className="note warn">{t('nv.captionCut')}</p>}

                    <label title={t('nv.bubblesTip')}>{t('nv.bubbles')}</label>
                    {(p.bubbles || []).map((b) => (
                      <div className="nv-bubble-row" key={b.id}>
                        <input className="nv-speaker" value={b.speaker} placeholder={t('nv.speaker')} title={t('nv.speakerTip')} onChange={(e) => setBubble(sel.shot.id, i, b.id, { speaker: e.target.value })} />
                        <AutoTextarea minRows={1} className="nv-line" value={b.text} placeholder={t('nv.text')} title={t('nv.textTip')} onChange={(e) => setBubble(sel.shot.id, i, b.id, { text: e.target.value })} />
                        <select value={b.tail || 'auto'} title={t('nv.tailTip')} onChange={(e) => setBubble(sel.shot.id, i, b.id, { tail: e.target.value })}>
                          {['auto', 'left', 'right', 'none'].map((v) => (
                            <option key={v} value={v}>{t(`nv.tail_${v}`)}</option>
                          ))}
                        </select>
                        {Number.isFinite(b.x) && (
                          <button className="btn small" title={t('nv.resetPosTip')} onClick={() => setPanel(sel.shot.id, i, (pp) => ({ bubbles: pp.bubbles.map((x) => (x.id === b.id ? { ...x, x: undefined, y: undefined } : x)) }))}>
                            {t('nv.resetPos')}
                          </button>
                        )}
                        <button className="icon-btn" title={t('nv.delBubbleTip')} aria-label={t('nv.delBubbleTip')} onClick={() => setPanel(sel.shot.id, i, (pp) => ({ bubbles: pp.bubbles.filter((x) => x.id !== b.id) }))}>
                          <Trash size={14} />
                        </button>
                      </div>
                    ))}
                    <button className="btn small" title={t('nv.addBubbleTip')} onClick={() => setPanel(sel.shot.id, i, (pp) => ({ bubbles: [...(pp.bubbles || []), newBubble()] }))}>
                      {t('nv.addBubble')}
                    </button>
                    {lost.length > 0 && <p className="note warn">{t('nv.lost', { lines: lost.map((l) => `${l.speaker ? `${l.speaker}: ` : ''}${l.text}`).join(' · ') })}</p>}
                  </div>
                );
              })()}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

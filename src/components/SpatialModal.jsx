import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { generateJSON, textKeyError } from '../lib/claude.js';
import { createSpatialView } from '../lib/spatial/scene3d.js';
import { layoutFor, sceneLayout, sceneCast, aspectValue, normalizeProp, wrapDeg, POSES, LENSES, POSE_TOP, MAX_PROPS, MAX_LAYOUT_CHARS } from '../lib/spatial/layout.js';
import { describeShot, continuityWarnings } from '../lib/spatial/describe.js';
import { layoutPrompt, layoutFromModel, shotLayoutPrompt, shotLayoutFromModel } from '../lib/spatial/build.js';
import { Trash, Plus, Stars } from './icons.jsx';

// Spatial layout of a scene: a 3D floor with block figures (left, the editor)
// and the view through the shot's camera (right). One layout per shot; a shot
// without its own layout continues the previous one. The measured description
// under the views is what the prompt writers receive.
export default function SpatialModal({ project, update, scene, settings, initialShotId = null, onClose }) {
  const { t } = useI18n();
  const shots = project.sceneDetails[scene.id]?.shots || [];
  const [shotId, setShotId] = useState(initialShotId && shots.some((s) => s.id === initialShotId) ? initialShotId : shots[0]?.id || null);
  const [sel, setSel] = useState(null); // { type: 'char' | 'prop' | 'camera', id }
  const [busy, setBusy] = useState(false); // false | 'all' | 'shot'
  const [error, setError] = useState('');
  const editorRef = useRef(null);
  const cameraRef = useRef(null);
  const viewRef = useRef(null);
  const drag = useRef(null);

  const aspect = aspectValue(project.aspectRatio);
  const layout = shotId ? layoutFor(project, scene, shotId) : null;
  const shotIndex = shots.findIndex((s) => s.id === shotId);
  const stored = sceneLayout(project, scene.id);
  const warnings = continuityWarnings(project, scene);
  const description = shotId ? describeShot(project, scene, shotId) : '';

  // ---- writing. A shot gets its own entry the first time it is edited.
  const writeShot = (fn) =>
    update((p) => {
      const sc = p.outline.find((s) => s.id === scene.id);
      const eff = layoutFor(p, sc, shotId);
      const cur = { chars: structuredClone(eff.chars), camera: { ...eff.camera } };
      fn(cur);
      const sl = (p.sceneLayouts || {})[scene.id] || { props: [], shots: {} };
      return { sceneLayouts: { ...(p.sceneLayouts || {}), [scene.id]: { ...sl, shots: { ...sl.shots, [shotId]: cur } } } };
    });
  const writeProps = (fn) =>
    update((p) => {
      const sl = (p.sceneLayouts || {})[scene.id] || { props: [], shots: {} };
      return { sceneLayouts: { ...(p.sceneLayouts || {}), [scene.id]: { ...sl, props: fn((sl.props || []).map(normalizeProp)) } } };
    });
  const setChar = (id, patch) => writeShot((cur) => Object.assign(cur.chars[id], patch));
  // The scene's cast: starts as everyone its shots name; the user may add or
  // remove characters, which fixes the list for this scene.
  const writeCast = (fn) =>
    update((p) => {
      const sc = p.outline.find((s) => s.id === scene.id);
      const sl = (p.sceneLayouts || {})[scene.id] || { props: [], shots: {} };
      const ids = fn(sceneCast(p, sc).map((c) => c.id)).slice(0, MAX_LAYOUT_CHARS);
      return { sceneLayouts: { ...(p.sceneLayouts || {}), [scene.id]: { ...sl, cast: ids } } };
    });
  const outsiders = (project.storyline?.characters || []).filter((c) => !sceneCast(project, scene).some((x) => x.id === c.id));
  const setCam = (patch) => writeShot((cur) => Object.assign(cur.camera, patch));
  const clearShot = () =>
    update((p) => {
      const sl = (p.sceneLayouts || {})[scene.id];
      if (!sl) return {};
      const next = { ...sl.shots };
      delete next[shotId];
      return { sceneLayouts: { ...p.sceneLayouts, [scene.id]: { ...sl, shots: next } } };
    });

  // ---- the 3D views
  useEffect(() => {
    const view = createSpatialView({ editorCanvas: editorRef.current, cameraCanvas: cameraRef.current });
    viewRef.current = view;
    const onResize = () => view.resize(aspect);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      view.dispose();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!viewRef.current || !layout) return;
    viewRef.current.setLayout(layout, sel, aspect);
    viewRef.current.resize(aspect);
  });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ---- pointer work in the editor view: drag a figure, a box or the camera
  // target across the floor; drag empty space to orbit; Shift-drag to pan.
  const onPointerDown = (e) => {
    const view = viewRef.current;
    if (!view) return;
    const hit = view.pick(e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (hit?.type === 'char' || hit?.type === 'prop') {
      setSel({ type: hit.type, id: hit.id });
      const at = view.floorPoint(e.clientX, e.clientY);
      const cur = hit.type === 'char' ? layout.chars[hit.id] : layout.props.find((p) => p.id === hit.id);
      drag.current = { kind: hit.type, id: hit.id, dx: at ? cur.x - at.x : 0, dz: at ? cur.z - at.z : 0 };
    } else if (hit?.type === 'target') {
      setSel({ type: 'camera' });
      drag.current = { kind: 'target' };
    } else {
      drag.current = { kind: e.shiftKey ? 'pan' : 'orbit', x: e.clientX, y: e.clientY };
    }
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    const view = viewRef.current;
    if (!d || !view) return;
    if (d.kind === 'orbit' || d.kind === 'pan') {
      (d.kind === 'orbit' ? view.orbitBy : view.panBy)(e.clientX - d.x, e.clientY - d.y);
      d.x = e.clientX;
      d.y = e.clientY;
      return;
    }
    const at = view.floorPoint(e.clientX, e.clientY);
    if (!at) return;
    const snap = (v) => Math.round(v * 10) / 10;
    if (d.kind === 'char') setChar(d.id, { x: snap(at.x + d.dx), z: snap(at.z + d.dz) });
    else if (d.kind === 'prop') writeProps((ps) => ps.map((p) => (p.id === d.id ? { ...p, x: snap(at.x + d.dx), z: snap(at.z + d.dz) } : p)));
    else if (d.kind === 'target') setCam({ tx: snap(at.x), tz: snap(at.z) });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // ---- rebuild the open shot only; the other shots and the set stay
  const buildShot = async () => {
    const keyErr = textKeyError(settings);
    if (keyErr) return setError(keyErr === 'NO_GEMINI_KEY' ? t('err.noGeminiKey') : t('err.noKey'));
    const sid = shotId;
    const index = shots.findIndex((x) => x.id === sid);
    if (index < 0) return undefined;
    if (stored?.shots?.[sid] && !window.confirm(t('sp.buildShotConfirm', { n: index + 1 }))) return undefined;
    setBusy('shot');
    setError('');
    try {
      const data = await generateJSON(settings, shotLayoutPrompt(project, scene, shots, index));
      const built = shotLayoutFromModel(project, scene, shots, index, data);
      if (!built) throw new Error(t('sp.buildEmpty'));
      update((p) => {
        const sl = (p.sceneLayouts || {})[scene.id] || { props: [], shots: {} };
        return { sceneLayouts: { ...(p.sceneLayouts || {}), [scene.id]: { ...sl, shots: { ...sl.shots, [sid]: built } } } };
      });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  // ---- build with the text model
  const build = async () => {
    const keyErr = textKeyError(settings);
    if (keyErr) return setError(keyErr === 'NO_GEMINI_KEY' ? t('err.noGeminiKey') : t('err.noKey'));
    if (stored && Object.keys(stored.shots || {}).length && !window.confirm(t('sp.buildConfirm'))) return undefined;
    setBusy('all');
    setError('');
    try {
      const data = await generateJSON(settings, layoutPrompt(project, scene, shots));
      const built = layoutFromModel(project, scene, shots, data);
      if (!Object.keys(built.shots).length) throw new Error(t('sp.buildEmpty'));
      update((p) => ({ sceneLayouts: { ...(p.sceneLayouts || {}), [scene.id]: built } }));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  // Save the camera view of the open shot with its layout (used as the shot's
  // intended composition), then close.
  const close = () => {
    try {
      if (viewRef.current && layout?.own) {
        const img = viewRef.current.snapshot();
        update((p) => {
          const sl = (p.sceneLayouts || {})[scene.id];
          if (!sl?.shots?.[shotId]) return {};
          return { sceneLayouts: { ...p.sceneLayouts, [scene.id]: { ...sl, shots: { ...sl.shots, [shotId]: { ...sl.shots[shotId], view: img } } } } };
        });
      }
    } catch {
      /* the view is a convenience; closing must always work */
    }
    onClose();
  };

  if (!layout) {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>{t('sp.title')}</h2>
          <p className="hint">{t('sp.noShots')}</p>
          <div className="modal-actions">
            <button className="btn primary" onClick={onClose}>{t('set.close')}</button>
          </div>
        </div>
      </div>
    );
  }

  const selChar = sel?.type === 'char' ? layout.cast.find((c) => c.id === sel.id) : null;
  const selProp = sel?.type === 'prop' ? layout.props.find((p) => p.id === sel.id) : null;
  const cam = layout.camera;
  const slider = (label, tip, value, min, max, step, onChange, unit = '') => (
    <label className="sp-slider" title={tip}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <i>{Math.round(value * 10) / 10}{unit}</i>
    </label>
  );
  const lookAt = (fromId, toId) => {
    const a = layout.chars[fromId];
    const b = layout.chars[toId];
    if (!a || !b) return;
    const ang = (Math.atan2(b.x - a.x, b.z - a.z) * 180) / Math.PI;
    setChar(fromId, { head: Math.max(-80, Math.min(80, wrapDeg(ang - a.rot))) });
  };
  const faceTo = (fromId, toId) => {
    const a = layout.chars[fromId];
    const b = layout.chars[toId];
    if (!a || !b) return;
    setChar(fromId, { rot: Math.round(wrapDeg((Math.atan2(b.x - a.x, b.z - a.z) * 180) / Math.PI)), head: 0 });
  };
  const aimAt = (id) => {
    const c = layout.chars[id];
    if (c) setCam({ tx: c.x, tz: c.z, ty: Math.max(0.3, Math.round(((POSE_TOP[c.pose] || 1.8) - 0.25) * 10) / 10) });
  };
  const addProp = () => {
    const pr = normalizeProp({ label: t('sp.propDefault'), x: 0, z: -2, w: 1, d: 0.5, h: 1 });
    writeProps((ps) => [...ps, pr].slice(0, MAX_PROPS));
    setSel({ type: 'prop', id: pr.id });
  };
  const patchProp = (id, patch) => writeProps((ps) => ps.map((p) => (p.id === id ? normalizeProp({ ...p, ...patch }) : p)));
  const warnText = (w) => t(`sp.warn_${w.kind}`, { n: w.shotIndex + 1, a: w.a, b: w.b, m: w.m });

  return (
    <div className="overlay" onClick={close}>
      <div className="modal sp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sp-top">
          <h2 title={t('sp.hint')}>{t('sp.title')} · {scene.title}</h2>
          <div className="sp-shots" role="tablist" aria-label={t('sp.shots')}>
            {shots.map((s, i) => {
              const own = !!stored?.shots?.[s.id];
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={s.id === shotId}
                  className={`sp-shot ${s.id === shotId ? 'on' : ''} ${own ? 'own' : ''}`}
                  title={`${t('sp.shotTip', { n: i + 1 })} — ${own ? t('sp.shotOwn') : t('sp.shotInherit')}: ${s.action || ''}`}
                  onClick={() => {
                    setShotId(s.id);
                    setSel(null);
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <button title={t('tip.spBuildShot', { n: shotIndex + 1 })} className="btn small fixedw-lg" disabled={!!busy || shotIndex < 0} onClick={buildShot}>
            <Stars size={13} /> {busy === 'shot' ? t('sp.building') : t('sp.rebuildShot')}
          </button>
          <button title={t('tip.spBuild')} className="btn small primary fixedw-lg" disabled={!!busy} onClick={build}>
            <Stars size={13} /> {busy === 'all' ? t('sp.building') : stored && Object.keys(stored.shots || {}).length ? t('sp.rebuild') : t('sp.build')}
          </button>
        </div>
        <p className="sp-action" title={t('sp.actionTip')}>
          <strong>{t('sp.shotTip', { n: shotIndex + 1 })}</strong> {shots[shotIndex]?.shotType ? `[${shots[shotIndex].shotType}] ` : ''}
          {shots[shotIndex]?.action}
          {!layout.own && <em> — {layout.inheritedFrom != null ? t('sp.inherits', { n: layout.inheritedFrom + 1 }) : t('sp.notPlaced')}</em>}
        </p>
        {error && <div className="note error">{error}</div>}

        <div className="sp-views">
          <div className="sp-pane">
            <div className="sp-pane-title" title={t('sp.editorTip')}>{t('sp.editor')}</div>
            <canvas
              ref={editorRef}
              className="sp-canvas sp-editor"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={(e) => viewRef.current?.zoomBy(e.deltaY)}
            />
          </div>
          <div className="sp-pane">
            <div className="sp-pane-title" title={t('sp.cameraTip')}>{t('sp.cameraView')} · {cam.lens} mm</div>
            <div className="sp-camera-box">
              <canvas ref={cameraRef} className="sp-canvas sp-camera" />
            </div>
          </div>
        </div>

        <div className="sp-panels">
          <div className="sp-panel">
            <div className="s5e-eyebrow" title={t('sp.castTip')}>{t('sp.cast')}</div>
            <div className="sp-cast">
              {layout.cast.map((c) => (
                <button key={c.id} type="button" className={`sp-chip ${selChar?.id === c.id ? 'on' : ''} ${layout.chars[c.id].off ? 'absent' : ''}`} title={`${t('sp.selectTip', { name: c.name })}${layout.chars[c.id].off ? ` — ${t('sp.absentTip')}` : ''}`} onClick={() => setSel({ type: 'char', id: c.id })}>
                  <i style={{ background: c.color.hex }} /> {c.name}
                </button>
              ))}
              {layout.props.map((p) => (
                <button key={p.id} type="button" className={`sp-chip ${selProp?.id === p.id ? 'on' : ''}`} title={t('sp.selectTip', { name: p.label || t('sp.propDefault') })} onClick={() => setSel({ type: 'prop', id: p.id })}>
                  <i className="sp-box-dot" /> {p.label || t('sp.propDefault')}
                </button>
              ))}
              {outsiders.length > 0 && layout.cast.length < MAX_LAYOUT_CHARS && (
                <select className="sp-add-char" title={t('tip.spAddChar')} value="" onChange={(e) => e.target.value && writeCast((ids) => [...ids, e.target.value])}>
                  <option value="">{t('sp.addChar')}</option>
                  {outsiders.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {layout.props.length < MAX_PROPS && (
                <button type="button" className="sp-chip add" title={t('tip.spAddProp')} onClick={addProp}>
                  <Plus size={12} /> {t('sp.addProp')}
                </button>
              )}
            </div>

            {selChar && (
              <div className="sp-props">
                <div className="sp-row">
                  <label className="check-row sp-present" title={t('tip.spPresent')}>
                    <input type="checkbox" checked={!layout.chars[selChar.id].off} onChange={(e) => setChar(selChar.id, { off: !e.target.checked })} />
                    <span>{t('sp.present')}</span>
                  </label>
                  <button type="button" className="btn small" title={t('tip.spRemoveChar')} onClick={() => { writeCast((ids) => ids.filter((x) => x !== selChar.id)); setSel(null); }}>{t('sp.removeChar')}</button>
                </div>
                <span className="seg seg-tall seg-compact" role="radiogroup" aria-label={t('sp.pose')}>
                  {POSES.map((po) => (
                    <button key={po} type="button" title={t(`sp.pose_${po}_tip`)} className={`seg-btn ${layout.chars[selChar.id].pose === po ? 'on' : ''}`} onClick={() => setChar(selChar.id, { pose: po })}>
                      {t(`sp.pose_${po}`)}
                    </button>
                  ))}
                </span>
                {slider(t('sp.rot'), t('tip.spRot'), layout.chars[selChar.id].rot, -180, 180, 5, (v) => setChar(selChar.id, { rot: v }), '°')}
                {slider(t('sp.head'), t('tip.spHead'), layout.chars[selChar.id].head, -80, 80, 5, (v) => setChar(selChar.id, { head: v }), '°')}
                {layout.cast.length > 1 && (
                  <div className="sp-row">
                    <select title={t('tip.spFace')} value="" onChange={(e) => e.target.value && faceTo(selChar.id, e.target.value)}>
                      <option value="">{t('sp.faceTo')}</option>
                      {layout.cast.filter((c) => c.id !== selChar.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select title={t('tip.spLook')} value="" onChange={(e) => e.target.value && lookAt(selChar.id, e.target.value)}>
                      <option value="">{t('sp.lookAt')}</option>
                      {layout.cast.filter((c) => c.id !== selChar.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
            {selProp && (
              <div className="sp-props">
                <div className="sp-row">
                  <input className="grow" value={selProp.label} placeholder={t('sp.propLabel')} title={t('tip.spPropLabel')} onChange={(e) => patchProp(selProp.id, { label: e.target.value })} />
                  <button type="button" className="s5e-ico" title={t('tip.spPropDelete')} aria-label={t('tip.spPropDelete')} onClick={() => { writeProps((ps) => ps.filter((p) => p.id !== selProp.id)); setSel(null); }}>
                    <Trash size={14} />
                  </button>
                </div>
                {slider(t('sp.width'), t('tip.spSize'), selProp.w, 0.2, 8, 0.1, (v) => patchProp(selProp.id, { w: v }), ' m')}
                {slider(t('sp.depth'), t('tip.spSize'), selProp.d, 0.1, 8, 0.1, (v) => patchProp(selProp.id, { d: v }), ' m')}
                {slider(t('sp.height'), t('tip.spSize'), selProp.h, 0.1, 4, 0.1, (v) => patchProp(selProp.id, { h: v }), ' m')}
                {slider(t('sp.rot'), t('tip.spRot'), selProp.rot, -180, 180, 5, (v) => patchProp(selProp.id, { rot: v }), '°')}
              </div>
            )}
            {!selChar && !selProp && <p className="hint">{t('sp.selectHint')}</p>}
          </div>

          <div className="sp-panel">
            <div className="s5e-eyebrow" title={t('sp.cameraTip')}>{t('sp.camera')}</div>
            <span className="seg seg-tall seg-compact" role="radiogroup" aria-label={t('sp.lens')} title={t('tip.spLens')}>
              {LENSES.map((l) => (
                <button key={l} type="button" className={`seg-btn ${cam.lens === l ? 'on' : ''}`} title={t('sp.lensTip', { n: l })} onClick={() => setCam({ lens: l })}>
                  {l} mm
                </button>
              ))}
            </span>
            {slider(t('sp.orbit'), t('tip.spOrbit'), cam.yaw, -180, 180, 5, (v) => setCam({ yaw: v }), '°')}
            {slider(t('sp.elevation'), t('tip.spElevation'), cam.pitch, -30, 89, 1, (v) => setCam({ pitch: v }), '°')}
            {slider(t('sp.distance'), t('tip.spDistance'), cam.dist, 0.6, 20, 0.1, (v) => setCam({ dist: v }), ' m')}
            {slider(t('sp.targetHeight'), t('tip.spTargetHeight'), cam.ty, 0, 3, 0.1, (v) => setCam({ ty: v }), ' m')}
            <div className="sp-row">
              <select title={t('tip.spAim')} value="" onChange={(e) => e.target.value && aimAt(e.target.value)}>
                <option value="">{t('sp.aimAt')}</option>
                {layout.cast.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {layout.own && shotIndex > 0 && (
                <button type="button" className="btn small" title={t('tip.spClear')} onClick={clearShot}>{t('sp.clearShot')}</button>
              )}
            </div>
          </div>

          <div className="sp-panel sp-report">
            <div className="s5e-eyebrow" title={t('sp.reportTip')}>{t('sp.report')}</div>
            <pre>{description || t('sp.reportEmpty')}</pre>
            {warnings.length > 0 && (
              <ul className="sp-warnings">
                {warnings.map((w, i) => (
                  <li key={i}>
                    <button type="button" title={t('sp.warnGo')} onClick={() => setShotId(shots[w.shotIndex].id)}>{warnText(w)}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <span className="hint sp-help">{t('sp.help')}</span>
          <button className="btn primary" title={t('tip.done')} onClick={close}>{t('pset.done')}</button>
        </div>
      </div>
    </div>
  );
}

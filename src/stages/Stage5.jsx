import { useState } from 'react';
import { useGenerate } from '../lib/useGenerate.js';
import { generateImage } from '../lib/gemini.js';
import { generateJSON } from '../lib/claude.js';
import { generateComfyVideo, saveToLocalOutputs } from '../lib/comfy.js';
import { stage5Prompt, stage5VideoPrompt, finalFramePrompt } from '../lib/prompts.js';
import { useI18n } from '../lib/i18n.js';
import { aspectDescription } from '../lib/aspect.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import { Download, RestoreIcon, MapPin } from '../components/icons.jsx';

// Small white icon on a round semi-transparent black chip, overlaid on images.
function IconAction({ title, disabled, onClick, children }) {
  return (
    <button type="button" className="img-icon-btn" title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function CopyButton({ text }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy:', text);
    }
  };
  return (
    <button type="button" className="copy-link" disabled={!text} onClick={copy}>
      {copied ? t('s5.copied') : t('s5.copy')}
    </button>
  );
}

export default function Stage5({ project, update, settings, onSettings, genLang, imageStyle, videoStyle, libUpsert, goNext }) {
  const { t } = useI18n();
  const [sceneId, setSceneId] = useState(project.outline[0]?.id || null);
  const [prog, setProg] = useState(null);
  const [refPrefs, setRefPrefs] = useState({}); // shotId -> { char, loc }
  const [imgBusy, setImgBusy] = useState(null); // shotId being generated
  const [imgErr, setImgErr] = useState(null); // { id, msg }
  const [refineText, setRefineText] = useState({}); // shotId -> instruction draft
  const [locSaved, setLocSaved] = useState(null); // shotId whose location ref was just saved
  const { busy, error, runMany, runBatch } = useGenerate(settings);

  const scene = project.outline.find((s) => s.id === sceneId) || project.outline[0];
  const shots = (scene && project.sceneDetails[scene.id]?.shots) || [];
  const hasPrompts = shots.some((s) => project.shotPrompts[s.id]);

  // Reference photos available for this scene.
  const charRefs = (project.storyline?.characters || [])
    .map((c) => c.photos?.[0])
    .filter(Boolean)
    .slice(0, 3);
  const locRefs = (scene?.photos || []).slice(0, 3);

  const prefFor = (shotId) => refPrefs[shotId] || { char: true, loc: true };
  const setPref = (shotId, patch) =>
    setRefPrefs((prev) => ({ ...prev, [shotId]: { char: true, loc: true, ...prev[shotId], ...patch } }));

  // Each generation is two calls (image prompts, then video prompts), each
  // returning only its own field — so merge into the existing entry, never
  // overwrite the other field.
  const applyPrompts = (targetScene, data) =>
    update((p) => {
      const sceneShots = p.sceneDetails[targetScene.id]?.shots || [];
      const next = { ...p.shotPrompts };
      (data.prompts || []).forEach((pr) => {
        const shot = sceneShots[(Number(pr.shot) || 1) - 1];
        if (!shot) return;
        const cur = next[shot.id] || {};
        next[shot.id] = {
          ...cur,
          imagePrompt: pr.image_prompt != null ? pr.image_prompt : cur.imagePrompt || '',
          videoPrompt: pr.video_prompt != null ? pr.video_prompt : cur.videoPrompt || '',
        };
      });
      return { shotPrompts: next };
    });

  const specFor = (s) => {
    const sceneArg = { ...s, number: project.outline.indexOf(s) + 1 };
    const sceneShots = project.sceneDetails[s.id]?.shots || [];
    return [
      stage5Prompt(project, sceneArg, sceneShots, genLang, imageStyle),
      stage5VideoPrompt(project, sceneArg, sceneShots, videoStyle),
    ];
  };

  const generate = () => {
    if (hasPrompts && !window.confirm(t('s5.replaceConfirm'))) return;
    runMany(specFor(scene), (data) => applyPrompts(scene, data));
  };

  const processAll = () => {
    const withShots = project.outline.filter((s) => project.sceneDetails[s.id]?.shots?.length);
    let targets = withShots.filter((s) =>
      project.sceneDetails[s.id].shots.some((sh) => !project.shotPrompts[sh.id])
    );
    if (!targets.length) {
      if (!window.confirm(t('batch.confirmAll5'))) return;
      targets = withShots;
    }
    runBatch(targets, specFor, (s, data) => applyPrompts(s, data), (a, b) => setProg(b ? { a, b } : null));
  };

  const setPrompt = (shotId, patch) =>
    update((p) => ({
      shotPrompts: {
        ...p.shotPrompts,
        [shotId]: { imagePrompt: '', videoPrompt: '', ...p.shotPrompts[shotId], ...patch },
      },
    }));

  // Generate the shot image via Gemini, attaching reference photos per the checkboxes.
  const genImage = async (shot) => {
    const prompt = project.shotPrompts[shot.id]?.imagePrompt?.trim();
    if (!prompt) return setImgErr({ id: shot.id, msg: t('img.needPrompt') });
    if (!settings.geminiKey) return setImgErr({ id: shot.id, msg: 'NO_GEMINI_KEY' });

    const pref = prefFor(shot.id);
    const useChar = pref.char ? charRefs : [];
    const useLoc = pref.loc ? locRefs : [];
    const images = [...useChar, ...useLoc];

    let text = '';
    if (imageStyle?.trim()) text += `Visual style: ${imageStyle.trim()}\n\n`;
    text += prompt;
    if (useChar.length || useLoc.length) {
      text += `\n\nReference images are attached.`;
      if (useChar.length)
        text += ` The first ${useChar.length} reference image(s) show the main character(s) — reproduce their faces and appearance faithfully and keep them consistent.`;
      if (useLoc.length)
        text += ` The ${useLoc.length === 1 ? 'last reference image shows' : `last ${useLoc.length} reference images show`} the location/environment — match its architecture, colors and lighting.`;
    }
    const ratio = project.aspectRatio || '16:9';
    text += `\n\nRender in ${aspectDescription(ratio)} (${ratio}) aspect ratio.`;

    setImgBusy(shot.id);
    setImgErr(null);
    try {
      const img = await generateImage(settings, { prompt: text, images, aspectRatio: ratio, imageSize: '2K' });
      pushVersion(shot.id, img);
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message || String(e) });
    } finally {
      setImgBusy(null);
    }
  };

  // New image becomes current; the previous current joins the history (max 5).
  const pushVersion = (shotId, img) =>
    update((p) => {
      const hist = { ...(p.shotImageHistory || {}) };
      const cur = (p.shotImages || {})[shotId];
      if (cur) hist[shotId] = [cur, ...(hist[shotId] || [])].slice(0, 5);
      return { shotImages: { ...p.shotImages, [shotId]: img }, shotImageHistory: hist };
    });

  // Swap a history version back to current (current takes its place in history).
  const restoreVersion = (shotId, idx) =>
    update((p) => {
      const hist = [...((p.shotImageHistory || {})[shotId] || [])];
      const chosen = hist[idx];
      if (!chosen) return {};
      hist.splice(idx, 1);
      const cur = (p.shotImages || {})[shotId];
      if (cur) hist.unshift(cur);
      return {
        shotImages: { ...p.shotImages, [shotId]: chosen },
        shotImageHistory: { ...(p.shotImageHistory || {}), [shotId]: hist.slice(0, 5) },
      };
    });

  // Edit-by-instruction: send the current image back to Nano Banana as the edit
  // reference with the user's refinement ("make it darker", "move camera lower").
  const refineImage = async (shot) => {
    const cur = (project.shotImages || {})[shot.id];
    const instruction = (refineText[shot.id] || '').trim();
    if (!cur || !instruction) return;
    if (!settings.geminiKey) return setImgErr({ id: shot.id, msg: 'NO_GEMINI_KEY' });
    const ratio = project.aspectRatio || '16:9';
    const prompt = `Edit the attached image according to this instruction: ${instruction}. Keep the subject, composition and style unchanged except for the requested change. Maintain ${ratio} aspect ratio.`;
    setImgBusy(shot.id);
    setImgErr(null);
    try {
      const img = await generateImage(settings, { prompt, images: [cur], aspectRatio: ratio, imageSize: '2K' });
      pushVersion(shot.id, img);
      setRefineText((v) => ({ ...v, [shot.id]: '' }));
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message || String(e) });
    } finally {
      setImgBusy(null);
    }
  };

  // FLF: generate the shot's FINAL frame from its first frame. Claude looks at
  // the first frame + the shot's plot and writes an edit prompt (same location,
  // same camera, only the subjects move to the action's end state), plus the
  // names of characters needed in the final frame that the first frame lacks —
  // their reference photos are attached so their appearance is preserved.
  const genFinalFrame = async (shot) => {
    const first = (project.shotImages || {})[shot.id];
    if (!first) return;
    if (!settings.apiKey) return setImgErr({ id: shot.id, msg: 'NO_KEY' });
    if (!settings.geminiKey) return setImgErr({ id: shot.id, msg: 'NO_GEMINI_KEY' });
    const sceneArg = { ...scene, number: project.outline.indexOf(scene) + 1 };
    setImgBusy(`${shot.id}:final`);
    setImgErr(null);
    try {
      const data = await generateJSON(settings, finalFramePrompt(project, sceneArg, shot, first, genLang));
      const wanted = (data.characters_to_add || []).map((n) => String(n).toLowerCase());
      const missingRefs = (project.storyline?.characters || [])
        .filter((c) => wanted.includes((c.name || '').toLowerCase()))
        .map((c) => ({ name: c.name, photo: c.photos?.[0] }))
        .filter((c) => c.photo)
        .slice(0, 3);

      const ratio = project.aspectRatio || '16:9';
      let text = `${data.image_prompt}\n\nThe FIRST attached image is the shot's first frame — edit it: keep the location, environment, lighting, camera angle and framing exactly as they are, and keep every character's appearance identical.`;
      if (missingRefs.length) {
        text += ` The ${missingRefs.length === 1 ? 'next attached image is a reference photo' : `next ${missingRefs.length} attached images are reference photos`} of ${missingRefs.map((c) => c.name).join(', ')} — these characters appear in the final frame; reproduce their faces and appearance faithfully.`;
      }
      text += `\n\nRender in ${aspectDescription(ratio)} (${ratio}) aspect ratio, matching the first frame's dimensions.`;

      const img = await generateImage(settings, {
        prompt: text,
        images: [first, ...missingRefs.map((c) => c.photo)],
        aspectRatio: ratio,
        imageSize: '2K',
      });
      update((p) => ({ shotFinalImages: { ...(p.shotFinalImages || {}), [shot.id]: img } }));
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message || String(e) });
    } finally {
      setImgBusy(null);
    }
  };

  // Turn the shot's first frame into a clean location reference: Gemini removes
  // every character and extends the frame outward on all sides (same aspect
  // ratio) to reveal more of the space. The result joins the scene's location
  // reference photos (newest kept, max 3) and the global location library.
  const makeLocationRef = async (shot) => {
    const first = (project.shotImages || {})[shot.id];
    if (!first) return;
    if (!settings.geminiKey) return setImgErr({ id: shot.id, msg: 'NO_GEMINI_KEY' });
    const ratio = project.aspectRatio || '16:9';
    const prompt = `Edit the attached image into a clean LOCATION REFERENCE plate. Remove ALL people, characters, animals and creatures from the frame, realistically reconstructing the environment behind them. Keep the location itself — architecture, interior/exterior details, furniture, props, colors, lighting, atmosphere and visual style — exactly as in the original. At the same time, zoom out: extend the frame boundaries in ALL directions (top, bottom, left and right) to reveal a bit more of the surrounding space beyond the original edges, seamlessly and plausibly continuing the environment, while keeping the exact same ${ratio} aspect ratio and camera perspective. No people, no text, no watermarks.`;
    setImgBusy(`${shot.id}:loc`);
    setImgErr(null);
    setLocSaved(null);
    try {
      const img = await generateImage(settings, { prompt, images: [first], aspectRatio: ratio, imageSize: '2K' });
      update((p) => ({
        outline: p.outline.map((s) =>
          s.id === scene.id ? { ...s, photos: [...(s.photos || []), img].slice(-3) } : s
        ),
      }));
      // Keep the global location library entry (shared with Stage 4) in sync.
      if (libUpsert) {
        libUpsert({
          id: `libl_${project.id}_${scene.id}`,
          kind: 'location',
          name: scene.title || '',
          type: 'other',
          description: scene.summary || '',
          photos: [...(scene.photos || []), img].slice(-3),
          projectId: project.id,
          projectTitle: project.title,
          createdAt: Date.now(),
        });
      }
      setLocSaved(shot.id);
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message || String(e) });
    } finally {
      setImgBusy(null);
    }
  };

  const downloadImage = (shot, i, final) => {
    const img = final ? (project.shotFinalImages || {})[shot.id] : project.shotImages[shot.id];
    if (!img) return;
    const safe = (project.title || 'shot').replace(/[^\w\d]+/g, '-');
    const a = document.createElement('a');
    a.href = img;
    a.download = `${safe}-scene${project.outline.indexOf(scene) + 1}-shot${i + 1}${final ? '-final' : ''}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadVideo = (shot, i) => {
    const vid = (project.shotVideos || {})[shot.id];
    if (!vid) return;
    const safe = (project.title || 'shot').replace(/[^\w\d]+/g, '-');
    const a = document.createElement('a');
    a.href = vid;
    a.download = `${safe}-scene${project.outline.indexOf(scene) + 1}-shot${i + 1}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Generate the shot video on the local ComfyUI: first frame + video prompt
  // through LTX-2 image-to-video, or first + final frame through the
  // first/last-frame workflow when a final frame exists. The result plays
  // inline and a copy lands in the local outputs folder.
  const genVideo = async (shot, i) => {
    const first = (project.shotImages || {})[shot.id];
    const vPrompt = (project.shotPrompts[shot.id]?.videoPrompt || '').trim();
    if (!first || !vPrompt) return;
    const last = (project.shotFinalImages || {})[shot.id] || null;
    setImgBusy(`${shot.id}:vid`);
    setImgErr(null);
    try {
      const { dataURL, filename } = await generateComfyVideo(settings, {
        prompt: vPrompt,
        firstFrame: first,
        lastFrame: last,
        durationSec: shot.duration,
        aspectRatio: project.aspectRatio || '16:9',
        name: `${(project.title || 'project').slice(0, 24)}_sc${project.outline.indexOf(scene) + 1}_shot${i + 1}`,
      });
      saveToLocalOutputs(settings, filename, dataURL); // best-effort local copy
      update((p) => ({ shotVideos: { ...(p.shotVideos || {}), [shot.id]: dataURL } }));
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message === 'COMFY_UNREACHABLE' ? 'COMFY_UNREACHABLE' : e.message || String(e) });
    } finally {
      setImgBusy(null);
    }
  };

  if (!project.outline.length) {
    return (
      <section className="stage">
        <h2>{t('s5.title')}</h2>
        <div className="note warn">{t('s5.needOutline')}</div>
      </section>
    );
  }

  return (
    <section className="stage">
      <h2>{t('s5.title')}</h2>
      <p className="stage-desc">{t('s5.desc')}</p>

      <div className="scene-chips">
        {project.outline.map((s, i) => {
          const sShots = project.sceneDetails[s.id]?.shots || [];
          const done = sShots.length > 0 && sShots.every((sh) => project.shotPrompts[sh.id]);
          return (
            <button
              key={s.id}
              className={`chip ${s.id === scene.id ? 'active' : ''} ${done ? 'done' : ''}`}
              onClick={() => setSceneId(s.id)}
            >
              {done ? '✓ ' : ''}{i + 1}. {s.title || t('s4.untitled')}
            </button>
          );
        })}
      </div>

      <div className="row">
        {shots.length > 0 && (
          <button className="btn primary" disabled={busy} onClick={generate}>
            {busy && !prog ? t('gen.generating') : hasPrompts ? t('s5.regenerate') : t('s5.generate', { n: shots.length })}
          </button>
        )}
        <button className="btn" disabled={busy} onClick={processAll}>{t('batch.run5')}</button>
        {prog && <span className="total-badge">{t('batch.progress', { a: prog.a, b: prog.b })}</span>}
      </div>
      <ErrorNote error={error} onSettings={onSettings} />

      {shots.length === 0 ? (
        <div className="note warn">{t('s5.noShots')}</div>
      ) : (
        shots.map((shot, i) => {
          const p = project.shotPrompts[shot.id] || { imagePrompt: '', videoPrompt: '' };
          const pref = prefFor(shot.id);
          const genImg = (project.shotImages || {})[shot.id];
          const finalImg = (project.shotFinalImages || {})[shot.id];
          const finalBusy = imgBusy === `${shot.id}:final`;
          const locBusy = imgBusy === `${shot.id}:loc`;
          const vidBusy = imgBusy === `${shot.id}:vid`;
          const anyBusy = imgBusy === shot.id || finalBusy || locBusy || vidBusy;
          const shotVid = (project.shotVideos || {})[shot.id];
          return (
            <div key={shot.id} className="shot-card">
              <div className="shot-head">
                <strong>{t('s4.shot', { n: i + 1 })}</strong>
                <span className="timecode">{shot.duration}s · {shot.shotType || '—'}</span>
              </div>
              <p className="shot-summary">{shot.action}</p>

              <div className="field">
                <div className="prompt-head">
                  <label>{t('s5.img')}</label>
                  <CopyButton text={p.imagePrompt} />
                </div>
                <AutoTextarea
                  minRows={4}
                  value={p.imagePrompt}
                  placeholder={t('s5.ph')}
                  onChange={(e) => setPrompt(shot.id, { imagePrompt: e.target.value })}
                />

                <div className="img-gen">
                  {!genImg && (
                    <button
                      className="btn small primary"
                      disabled={imgBusy === shot.id || !p.imagePrompt}
                      onClick={() => genImage(shot)}
                    >
                      {imgBusy === shot.id ? t('img.generating') : t('img.generate')}
                    </button>
                  )}
                  {genImg && anyBusy && <span className="hint">{t('img.generating')}</span>}
                  <button
                    type="button"
                    className={`check-toggle ${pref.char ? 'on' : ''}`}
                    disabled={!charRefs.length}
                    aria-pressed={pref.char}
                    onClick={() => setPref(shot.id, { char: !pref.char })}
                  >
                    <span className="box" />
                    {t('img.useChar')}
                  </button>
                  <button
                    type="button"
                    className={`check-toggle ${pref.loc ? 'on' : ''}`}
                    disabled={!locRefs.length}
                    aria-pressed={pref.loc}
                    onClick={() => setPref(shot.id, { loc: !pref.loc })}
                  >
                    <span className="box" />
                    {t('img.useLoc')}
                  </button>
                </div>

                {imgErr?.id === shot.id &&
                  (imgErr.msg === 'NO_GEMINI_KEY' || imgErr.msg === 'NO_KEY' || imgErr.msg === 'COMFY_UNREACHABLE' ? (
                    <div className="note warn">
                      {t(
                        imgErr.msg === 'NO_KEY'
                          ? 'err.noKey'
                          : imgErr.msg === 'COMFY_UNREACHABLE'
                            ? 'err.comfyDown'
                            : 'err.noGeminiKey'
                      )}{' '}
                      <button className="btn small" onClick={onSettings}>{t('err.openSettings')}</button>
                    </div>
                  ) : (
                    <div className="note error">{imgErr.msg}</div>
                  ))}

                {genImg && (
                  <div className="gen-image">
                    {(() => {
                      const firstActions = (
                        <div className="img-actions">
                          <IconAction
                            title={t('img.regenerate')}
                            disabled={anyBusy || !p.imagePrompt}
                            onClick={() => genImage(shot)}
                          >
                            <RestoreIcon size={14} />
                          </IconAction>
                          <IconAction title={t('img.download')} onClick={() => downloadImage(shot, i)}>
                            <Download size={14} />
                          </IconAction>
                          <IconAction title={t('img.locRef')} disabled={anyBusy} onClick={() => makeLocationRef(shot)}>
                            <MapPin size={14} />
                          </IconAction>
                        </div>
                      );
                      return finalImg ? (
                        <div className="frame-pair">
                          <figure>
                            <div className="img-wrap">
                              <img src={genImg} alt="" />
                              {firstActions}
                            </div>
                            <figcaption>{t('img.first')}</figcaption>
                          </figure>
                          <figure>
                            <div className="img-wrap">
                              <img src={finalImg} alt="" />
                              <div className="img-actions">
                                <IconAction title={t('img.finalRegen')} disabled={anyBusy} onClick={() => genFinalFrame(shot)}>
                                  <RestoreIcon size={14} />
                                </IconAction>
                                <IconAction title={t('img.downloadFinal')} onClick={() => downloadImage(shot, i, true)}>
                                  <Download size={14} />
                                </IconAction>
                              </div>
                            </div>
                            <figcaption>{t('img.final')}</figcaption>
                          </figure>
                        </div>
                      ) : (
                        <div className="img-wrap">
                          <img src={genImg} alt="" />
                          {firstActions}
                        </div>
                      );
                    })()}
                    <div className="row">
                      {!finalImg && (
                        <button className="btn tiny" disabled={anyBusy} onClick={() => genFinalFrame(shot)}>
                          {finalBusy ? t('img.generating') : t('img.finalCreate')}
                        </button>
                      )}
                      {locSaved === shot.id && <span className="hint">{t('img.locSaved')}</span>}
                      {((project.shotImageHistory || {})[shot.id] || []).length > 0 && (
                        <span className="hint">{t('ver.label')}:</span>
                      )}
                      {((project.shotImageHistory || {})[shot.id] || []).map((v, vi) => (
                        <button
                          key={vi}
                          type="button"
                          className="ver-thumb"
                          title={t('ver.restore')}
                          onClick={() => restoreVersion(shot.id, vi)}
                        >
                          <img src={v} alt="" />
                        </button>
                      ))}
                    </div>
                    <div className="voice-row refine-row">
                      <input
                        value={refineText[shot.id] || ''}
                        placeholder={t('ver.refinePh')}
                        onChange={(e) => setRefineText((v) => ({ ...v, [shot.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && refineImage(shot)}
                      />
                      <button
                        className="btn small"
                        disabled={imgBusy === shot.id || !(refineText[shot.id] || '').trim()}
                        onClick={() => refineImage(shot)}
                      >
                        {imgBusy === shot.id ? t('img.generating') : t('ver.refine')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="field">
                <div className="prompt-head">
                  <label>{t('s5.vid', { d: shot.duration })}</label>
                  <CopyButton text={p.videoPrompt} />
                </div>
                <AutoTextarea
                  minRows={4}
                  value={p.videoPrompt}
                  placeholder={t('s5.ph')}
                  onChange={(e) => setPrompt(shot.id, { videoPrompt: e.target.value })}
                />

                <div className="img-gen">
                  {!shotVid && (
                    <button
                      className="btn small primary"
                      disabled={anyBusy || !p.videoPrompt?.trim() || !genImg}
                      onClick={() => genVideo(shot, i)}
                    >
                      {vidBusy ? t('vid.generating') : t('vid.generate')}
                    </button>
                  )}
                  {shotVid && vidBusy && <span className="hint">{t('vid.generating')}</span>}
                  {!genImg && <span className="hint">{t('vid.needFrame')}</span>}
                  {genImg && (
                    <span className="hint">{finalImg ? t('vid.modeFLF') : t('vid.modeI2V')}</span>
                  )}
                </div>

                {shotVid && (
                  <div className="gen-image">
                    <div className="img-wrap vid-wrap">
                      <video src={shotVid} controls preload="metadata" />
                      <div className="img-actions">
                        <IconAction
                          title={t('vid.regenerate')}
                          disabled={anyBusy}
                          onClick={() => genVideo(shot, i)}
                        >
                          <RestoreIcon size={14} />
                        </IconAction>
                        <IconAction title={t('vid.download')} onClick={() => downloadVideo(shot, i)}>
                          <Download size={14} />
                        </IconAction>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

      {shots.length > 0 && (
        <footer className="stage-footer">
          <button className="btn primary big" onClick={goNext}>
            {t('s5.continue')}
          </button>
        </footer>
      )}
    </section>
  );
}

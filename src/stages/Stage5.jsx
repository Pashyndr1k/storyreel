import { useState } from 'react';
import { useGenerate } from '../lib/useGenerate.js';
import { generateImage } from '../lib/gemini.js';
import { generateJSON } from '../lib/claude.js';
import { stage5Prompt, stage5VideoPrompt, finalFramePrompt } from '../lib/prompts.js';
import { useI18n } from '../lib/i18n.js';
import { aspectDescription } from '../lib/aspect.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';

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

export default function Stage5({ project, update, settings, onSettings, genLang, imageStyle, videoStyle }) {
  const { t } = useI18n();
  const [sceneId, setSceneId] = useState(project.outline[0]?.id || null);
  const [prog, setProg] = useState(null);
  const [refPrefs, setRefPrefs] = useState({}); // shotId -> { char, loc }
  const [imgBusy, setImgBusy] = useState(null); // shotId being generated
  const [imgErr, setImgErr] = useState(null); // { id, msg }
  const [refineText, setRefineText] = useState({}); // shotId -> instruction draft
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
                  <button
                    className="btn small primary"
                    disabled={imgBusy === shot.id || !p.imagePrompt}
                    onClick={() => genImage(shot)}
                  >
                    {imgBusy === shot.id ? t('img.generating') : genImg ? t('img.regenerate') : t('img.generate')}
                  </button>
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
                  (imgErr.msg === 'NO_GEMINI_KEY' || imgErr.msg === 'NO_KEY' ? (
                    <div className="note warn">
                      {t(imgErr.msg === 'NO_KEY' ? 'err.noKey' : 'err.noGeminiKey')}{' '}
                      <button className="btn small" onClick={onSettings}>{t('err.openSettings')}</button>
                    </div>
                  ) : (
                    <div className="note error">{imgErr.msg}</div>
                  ))}

                {genImg && (
                  <div className="gen-image">
                    {finalImg ? (
                      <div className="frame-pair">
                        <figure>
                          <img src={genImg} alt="" />
                          <figcaption>{t('img.first')}</figcaption>
                        </figure>
                        <figure>
                          <img src={finalImg} alt="" />
                          <figcaption>{t('img.final')}</figcaption>
                        </figure>
                      </div>
                    ) : (
                      <img src={genImg} alt="" />
                    )}
                    <div className="row">
                      <button className="btn tiny" onClick={() => downloadImage(shot, i)}>{t('img.download')}</button>
                      <button
                        className="btn tiny"
                        disabled={finalBusy || imgBusy === shot.id}
                        onClick={() => genFinalFrame(shot)}
                      >
                        {finalBusy ? t('img.generating') : finalImg ? t('img.finalRegen') : t('img.finalCreate')}
                      </button>
                      {finalImg && (
                        <button className="btn tiny" onClick={() => downloadImage(shot, i, true)}>
                          {t('img.downloadFinal')}
                        </button>
                      )}
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
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}

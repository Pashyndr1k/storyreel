import { useState } from 'react';
import { useGenerate } from '../lib/useGenerate.js';
import { generateImage } from '../lib/gemini.js';
import { stage5Prompt } from '../lib/prompts.js';
import { useI18n } from '../lib/i18n.js';
import ErrorNote from '../components/ErrorNote.jsx';

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
    <button className="btn tiny" disabled={!text} onClick={copy}>
      {copied ? t('s5.copied') : t('s5.copy')}
    </button>
  );
}

export default function Stage5({ project, update, settings, onSettings, genLang }) {
  const { t } = useI18n();
  const [sceneId, setSceneId] = useState(project.outline[0]?.id || null);
  const [prog, setProg] = useState(null);
  const [refPrefs, setRefPrefs] = useState({}); // shotId -> { char, loc }
  const [imgBusy, setImgBusy] = useState(null); // shotId being generated
  const [imgErr, setImgErr] = useState(null); // { id, msg }
  const { busy, error, run, runBatch } = useGenerate(settings);

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
    setRefPrefs((prev) => ({ ...prev, [shotId]: { ...prefFor(shotId), ...patch } }));

  const applyPrompts = (targetScene, data) =>
    update((p) => {
      const sceneShots = p.sceneDetails[targetScene.id]?.shots || [];
      const next = { ...p.shotPrompts };
      (data.prompts || []).forEach((pr) => {
        const shot = sceneShots[(Number(pr.shot) || 1) - 1];
        if (shot) next[shot.id] = { imagePrompt: pr.image_prompt || '', videoPrompt: pr.video_prompt || '' };
      });
      return { shotPrompts: next };
    });

  const specFor = (s) =>
    stage5Prompt(project, { ...s, number: project.outline.indexOf(s) + 1 }, project.sceneDetails[s.id]?.shots || [], genLang);

  const generate = () => {
    if (hasPrompts && !window.confirm(t('s5.replaceConfirm'))) return;
    run(specFor(scene), (data) => applyPrompts(scene, data));
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

    let text = prompt;
    if (useChar.length || useLoc.length) {
      text += `\n\nReference images are attached.`;
      if (useChar.length)
        text += ` The first ${useChar.length} reference image(s) show the main character(s) — reproduce their faces and appearance faithfully and keep them consistent.`;
      if (useLoc.length)
        text += ` The ${useLoc.length === 1 ? 'last reference image shows' : `last ${useLoc.length} reference images show`} the location/environment — match its architecture, colors and lighting.`;
    }
    text += `\n\nRender in 16:9 widescreen aspect ratio.`;

    setImgBusy(shot.id);
    setImgErr(null);
    try {
      const img = await generateImage(settings, { prompt: text, images, aspectRatio: '16:9' });
      update((p) => ({ shotImages: { ...p.shotImages, [shot.id]: img } }));
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message || String(e) });
    } finally {
      setImgBusy(null);
    }
  };

  const downloadImage = (shot, i) => {
    const img = project.shotImages[shot.id];
    if (!img) return;
    const safe = (project.title || 'shot').replace(/[^\w\d]+/g, '-');
    const a = document.createElement('a');
    a.href = img;
    a.download = `${safe}-scene${project.outline.indexOf(scene) + 1}-shot${i + 1}.jpg`;
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
                <textarea
                  rows={4}
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
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={pref.char}
                      disabled={!charRefs.length}
                      onChange={(e) => setPref(shot.id, { char: e.target.checked })}
                    />
                    {t('img.useChar')}
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={pref.loc}
                      disabled={!locRefs.length}
                      onChange={(e) => setPref(shot.id, { loc: e.target.checked })}
                    />
                    {t('img.useLoc')}
                  </label>
                </div>

                {imgErr?.id === shot.id &&
                  (imgErr.msg === 'NO_GEMINI_KEY' ? (
                    <div className="note warn">
                      {t('err.noGeminiKey')} <button className="btn small" onClick={onSettings}>{t('err.openSettings')}</button>
                    </div>
                  ) : (
                    <div className="note error">{imgErr.msg}</div>
                  ))}

                {genImg && (
                  <div className="gen-image">
                    <img src={genImg} alt="" />
                    <button className="btn tiny" onClick={() => downloadImage(shot, i)}>{t('img.download')}</button>
                  </div>
                )}
              </div>

              <div className="field">
                <div className="prompt-head">
                  <label>{t('s5.vid', { d: shot.duration })}</label>
                  <CopyButton text={p.videoPrompt} />
                </div>
                <textarea
                  rows={4}
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

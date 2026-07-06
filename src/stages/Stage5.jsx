import { useState } from 'react';
import { useGenerate } from '../lib/useGenerate.js';
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

export default function Stage5({ project, update, settings, onSettings }) {
  const { t, lang } = useI18n();
  const [sceneId, setSceneId] = useState(project.outline[0]?.id || null);
  const { busy, error, run } = useGenerate(settings);

  const scene = project.outline.find((s) => s.id === sceneId) || project.outline[0];
  const shots = (scene && project.sceneDetails[scene.id]?.shots) || [];
  const hasPrompts = shots.some((s) => project.shotPrompts[s.id]);

  const generate = () => {
    if (hasPrompts && !window.confirm(t('s5.replaceConfirm'))) return;
    run(
      stage5Prompt(project, { ...scene, number: project.outline.indexOf(scene) + 1 }, shots, lang),
      (data) =>
        update((p) => {
          const next = { ...p.shotPrompts };
          (data.prompts || []).forEach((pr) => {
            const shot = shots[(Number(pr.shot) || 1) - 1];
            if (shot) {
              next[shot.id] = {
                imagePrompt: pr.image_prompt || '',
                videoPrompt: pr.video_prompt || '',
              };
            }
          });
          return { shotPrompts: next };
        })
    );
  };

  const setPrompt = (shotId, patch) =>
    update((p) => ({
      shotPrompts: {
        ...p.shotPrompts,
        [shotId]: { imagePrompt: '', videoPrompt: '', ...p.shotPrompts[shotId], ...patch },
      },
    }));

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

      {shots.length === 0 ? (
        <div className="note warn">{t('s5.noShots')}</div>
      ) : (
        <>
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={generate}>
              {busy
                ? t('gen.generating')
                : hasPrompts
                  ? t('s5.regenerate')
                  : t('s5.generate', { n: shots.length })}
            </button>
          </div>
          <ErrorNote error={error} onSettings={onSettings} />

          {shots.map((shot, i) => {
            const p = project.shotPrompts[shot.id] || { imagePrompt: '', videoPrompt: '' };
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
          })}
        </>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useGenerate } from '../lib/useGenerate.js';
import { generateJSON } from '../lib/claude.js';
import { generateImage } from '../lib/gemini.js';
import { stage2Prompt, extractCharacterPrompt, coverPromptSpec } from '../lib/prompts.js';
import { uid } from '../lib/storage.js';
import { fileToResizedDataURL } from '../lib/images.js';
import { useI18n } from '../lib/i18n.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import VoiceButton from '../components/VoiceButton.jsx';

export default function Stage2({ project, update, settings, goNext, onSettings, genLang, scriptStyle, imageStyle }) {
  const { t } = useI18n();
  const { busy, error, run } = useGenerate(settings);
  const storyline = project.storyline;

  const [coverBusy, setCoverBusy] = useState(false);
  const [coverErr, setCoverErr] = useState('');
  const coverTried = useRef(false);

  const generate = () => {
    if (storyline && !window.confirm(t('s2.replaceConfirm'))) return;
    run(stage2Prompt(project, genLang, scriptStyle), (data) =>
      update((p) => ({
        storyline: {
          synopsis: data.synopsis || '',
          characters: (data.characters || []).map((c) => ({
            id: uid(),
            name: c.name || '',
            role: c.role || '',
            description: c.description || '',
            photos: [],
          })),
        },
        title: data.title || p.title,
        genres: Array.isArray(data.genres) && data.genres.length ? data.genres.slice(0, 3) : p.genres,
      }))
    );
  };

  // Cover = Claude picks the key visual from the synopsis, Gemini renders it.
  const genCover = async () => {
    if (!settings.apiKey) return setCoverErr('NO_KEY');
    if (!settings.geminiKey) return setCoverErr('NO_GEMINI_KEY');
    if (!project.storyline?.synopsis?.trim()) return;
    setCoverBusy(true);
    setCoverErr('');
    try {
      const promptData = await generateJSON(settings, coverPromptSpec(project, genLang, imageStyle));
      let coverPrompt = '';
      if (imageStyle?.trim()) coverPrompt += `Visual style: ${imageStyle.trim()}\n\n`;
      coverPrompt += `${promptData.image_prompt}\n\nRender in 16:9 widescreen aspect ratio.`;
      const cover = await generateImage(settings, {
        prompt: coverPrompt,
        aspectRatio: '16:9',
        imageSize: '2K',
      });
      update({ cover });
    } catch (e) {
      setCoverErr(e.message || String(e));
    } finally {
      setCoverBusy(false);
    }
  };

  // Auto-generate a cover once when the synopsis exists and there's no cover yet.
  useEffect(() => {
    if (coverTried.current || coverBusy) return;
    if (project.storyline?.synopsis?.trim() && !project.cover && settings.apiKey && settings.geminiKey) {
      coverTried.current = true;
      genCover();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.storyline?.synopsis, project.cover, settings.apiKey, settings.geminiKey]);

  const setSynopsis = (synopsis) => update((p) => ({ storyline: { ...p.storyline, synopsis } }));

  const updateChar = (id, patch) =>
    update((p) => ({
      storyline: {
        ...p.storyline,
        characters: p.storyline.characters.map((c) =>
          c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c
        ),
      },
    }));

  const addChar = () =>
    update((p) => ({
      storyline: {
        ...p.storyline,
        characters: [...p.storyline.characters, { id: uid(), name: '', role: '', description: '', photos: [] }],
      },
    }));

  const removeChar = (id) =>
    update((p) => ({
      storyline: { ...p.storyline, characters: p.storyline.characters.filter((c) => c.id !== id) },
    }));

  const addPhoto = async (id, file) => {
    try {
      const dataURL = await fileToResizedDataURL(file);
      updateChar(id, (c) => ({ photos: [...(c.photos || []), dataURL].slice(0, 3) }));
    } catch (e) {
      window.alert(e.message);
    }
  };

  const removePhoto = (id, idx) =>
    updateChar(id, (c) => ({ photos: (c.photos || []).filter((_, i) => i !== idx) }));

  const extract = (c) => {
    if (c.description?.trim() && !window.confirm(t('char.extractConfirm'))) return;
    run(extractCharacterPrompt(c, genLang), (data) => {
      if (data.description) updateChar(c.id, { description: data.description });
    });
  };

  const coverErrNode = () => {
    if (!coverErr) return null;
    if (coverErr === 'NO_GEMINI_KEY')
      return (
        <div className="note warn">
          {t('err.noGeminiKey')} <button className="btn small" onClick={onSettings}>{t('err.openSettings')}</button>
        </div>
      );
    if (coverErr === 'NO_KEY')
      return (
        <div className="note warn">
          {t('err.noKey')} <button className="btn small" onClick={onSettings}>{t('err.openSettings')}</button>
        </div>
      );
    return <div className="note error">{t('err.failed')} {coverErr}</div>;
  };

  return (
    <section className="stage">
      <h2>{t('s2.title')}</h2>
      <p className="stage-desc">{t('s2.desc')}</p>

      <details className="context-box">
        <summary>{t('s2.approvedPlot')}</summary>
        <p>{project.approvedPlot}</p>
      </details>

      <div className="row">
        <button className="btn primary" disabled={busy} onClick={generate}>
          {busy ? t('gen.generating') : storyline ? t('s2.regenerate') : t('s2.generate')}
        </button>
      </div>
      <ErrorNote error={error} onSettings={onSettings} />

      {storyline && (
        <>
          <div className="cover-block">
            <label>{t('cover.label')}</label>
            <div className="cover-row">
              <div className="cover-frame">
                {project.cover ? (
                  <img className="cover-preview" src={project.cover} alt={t('cover.label')} />
                ) : (
                  <div className="cover-placeholder">{coverBusy ? '…' : '16:9'}</div>
                )}
                {coverBusy && <div className="cover-loading">{t('cover.generating')}</div>}
              </div>
              <div className="cover-side">
                <p className="hint">{t('cover.auto')}</p>
                <button className="btn small" disabled={coverBusy} onClick={genCover}>
                  {coverBusy ? t('cover.generating') : project.cover ? t('cover.regenerate') : t('cover.generate')}
                </button>
                {coverErrNode()}
              </div>
            </div>
          </div>

          <label>{t('s2.synopsis')}</label>
          <div className="voice-row">
            <AutoTextarea minRows={7} value={storyline.synopsis} onChange={(e) => setSynopsis(e.target.value)} />
            <VoiceButton
              settings={settings}
              onText={(text) => setSynopsis(storyline.synopsis ? `${storyline.synopsis} ${text}` : text)}
            />
          </div>

          <div className="section-head">
            <label>{t('s2.characters')}</label>
            <button className="btn small" onClick={addChar}>{t('s2.addChar')}</button>
          </div>
          {storyline.characters.map((c) => (
            <div key={c.id} className="char-card">
              <div className="row">
                <input
                  className="grow"
                  value={c.name}
                  placeholder={t('s2.name')}
                  onChange={(e) => updateChar(c.id, { name: e.target.value })}
                />
                <input
                  className="grow"
                  value={c.role}
                  placeholder={t('s2.role')}
                  onChange={(e) => updateChar(c.id, { role: e.target.value })}
                />
                <button className="btn danger small" onClick={() => removeChar(c.id)}>✕</button>
              </div>
              <AutoTextarea
                minRows={3}
                value={c.description}
                placeholder={t('s2.charDesc')}
                onChange={(e) => updateChar(c.id, { description: e.target.value })}
              />
              <label className="photos-label">{t('char.photos')}</label>
              <div className="photo-row">
                {(c.photos || []).map((ph, i) => (
                  <div key={i} className="photo-thumb">
                    <img src={ph} alt="" />
                    <button className="photo-x" onClick={() => removePhoto(c.id, i)}>✕</button>
                  </div>
                ))}
                {(c.photos || []).length < 3 && (
                  <label className="btn small file-btn">
                    {t('char.addPhoto')}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) addPhoto(c.id, f);
                      }}
                    />
                  </label>
                )}
                {(c.photos || []).length > 0 && (
                  <button className="btn small" disabled={busy} onClick={() => extract(c)}>
                    {busy ? t('gen.generating') : t('char.extract')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      <footer className="stage-footer">
        <button className="btn primary big" disabled={!storyline || !storyline.synopsis.trim()} onClick={goNext}>
          {t('s2.continue')}
        </button>
      </footer>
    </section>
  );
}

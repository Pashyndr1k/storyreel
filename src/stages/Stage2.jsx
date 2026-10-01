import { useEffect, useRef, useState } from 'react';
import { useGenerate } from '../lib/useGenerate.js';
import { generateJSON, textKeyError } from '../lib/claude.js';
import { generateCoverImage, generateImage } from '../lib/gemini.js';
import { resizeDataURL } from '../lib/images.js';
import { Stars } from '../components/icons.jsx';
import { stage2Prompt, extractCharacterPrompt, coverPromptSpec } from '../lib/prompts.js';
import { uid } from '../lib/storage.js';
import { fileToResizedDataURL } from '../lib/images.js';
import { useI18n } from '../lib/i18n.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import Lightbox from '../components/Lightbox.jsx';
import CharacterHelp from '../components/CharacterHelp.jsx';
import VoiceButton from '../components/VoiceButton.jsx';
import LibraryPicker from '../components/LibraryPicker.jsx';
import { StylePicker } from '../components/StyleControls.jsx';
import { RestoreIcon, Upload, Layers } from '../components/icons.jsx';

export default function Stage2({ project, update, rawUpdate, settings, goNext, onSettings, genLang, styles, scriptStyle, imageStyle, imageStylePlus = false, library, libUpsert }) {
  const [pickFor, setPickFor] = useState(null); // character id awaiting a library pick
  const { t } = useI18n();
  const [lightbox, setLightbox] = useState(null); // full-size photo pop-up
  const [charHelp, setCharHelp] = useState(false); // the character-profile rules panel
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
          // groups survive a regenerated storyline, but the cast is new —
          // their members have to be picked again
          groups: (p.storyline?.groups || []).map((g) => ({ ...g, memberIds: [] })),
        },
        title: data.title || p.title,
        genres: Array.isArray(data.genres) && data.genres.length ? data.genres.slice(0, 3) : p.genres,
      }))
    );
  };

  // Cover = Claude picks the key visual from the synopsis, Gemini renders it.
  const genCover = async () => {
    const keyErr = textKeyError(settings);
    if (keyErr) return setCoverErr(keyErr);
    if (!settings.geminiKey) return setCoverErr('NO_GEMINI_KEY');
    if (!project.storyline?.synopsis?.trim()) return;
    setCoverBusy(true);
    setCoverErr('');
    try {
      const promptData = await generateJSON(settings, coverPromptSpec(project, genLang, imageStyle, imageStylePlus));
      let coverPrompt = '';
      if (imageStyle?.trim()) coverPrompt += `Visual style: ${imageStyle.trim()}\n\n`;
      coverPrompt += `${promptData.image_prompt}\n\nRender in 16:9 widescreen aspect ratio.`;
      const cover = await generateCoverImage(settings, {
        prompt: coverPrompt,
        aspectRatio: '16:9',
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
      storyline: {
        ...p.storyline,
        characters: p.storyline.characters.filter((c) => c.id !== id),
        groups: (p.storyline.groups || []).map((g) => ({ ...g, memberIds: (g.memberIds || []).filter((x) => x !== id) })),
      },
    }));

  // ---- actor groups: several characters that act as ONE entity (a band, a
  // crew, a family). Members are ordinary characters with their own photos;
  // naming the group in a shot stands for all of them.
  const groups = storyline?.groups || [];
  const setGroups = (fn) => update((p) => ({ storyline: { ...p.storyline, groups: fn(p.storyline.groups || []) } }));
  const addGroup = () => setGroups((gs) => [...gs, { id: uid(), name: '', description: '', memberIds: [] }]);
  const patchGroup = (id, patch) => setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const removeGroup = (id) => setGroups((gs) => gs.filter((g) => g.id !== id));
  const toggleMember = (gid, cid) =>
    setGroups((gs) =>
      gs.map((g) =>
        g.id === gid
          ? { ...g, memberIds: (g.memberIds || []).includes(cid) ? g.memberIds.filter((x) => x !== cid) : [...(g.memberIds || []), cid] }
          : g
      )
    );
  // a new character created straight into the group
  const addMember = (gid) =>
    update((p) => {
      const id = uid();
      return {
        storyline: {
          ...p.storyline,
          characters: [...p.storyline.characters, { id, name: '', role: '', description: '', photos: [] }],
          groups: (p.storyline.groups || []).map((g) => (g.id === gid ? { ...g, memberIds: [...(g.memberIds || []), id] } : g)),
        },
      };
    });

  // Keep the global character library in sync: any character that gets photos
  // is auto-added (or updated) as a library entry.
  const syncToLibrary = (char, photos) => {
    if (!libUpsert || !photos.length) return;
    const entryId = char.libId || `libc_${project.id}_${char.id}`;
    libUpsert({
      id: entryId,
      kind: 'character',
      name: char.name || '',
      type: 'other',
      description: char.description || '',
      photos,
      projectId: project.id,
      projectTitle: project.title,
      createdAt: Date.now(),
    });
    if (!char.libId) updateChar(char.id, { libId: entryId });
  };

  const addPhoto = async (id, file) => {
    try {
      const dataURL = await fileToResizedDataURL(file);
      const char = project.storyline.characters.find((c) => c.id === id);
      const photos = [...(char?.photos || []), dataURL].slice(0, 3);
      updateChar(id, { photos });
      if (char) syncToLibrary(char, photos);
    } catch (e) {
      window.alert(e.message);
    }
  };

  // Import a library character: photos fill the remaining slots; empty
  // name/description are taken from the entry; the character links to it.
  const pickFromLibrary = (charId, entry) => {
    const char = project.storyline.characters.find((c) => c.id === charId);
    if (!char) return;
    const photos = [...(char.photos || []), ...entry.photos].slice(0, 3);
    updateChar(charId, {
      photos,
      libId: entry.id,
      ...(char.name ? {} : { name: entry.name }),
      ...(char.description ? {} : { description: entry.description }),
    });
  };

  const removePhoto = (id, idx) =>
    updateChar(id, (c) => ({ photos: (c.photos || []).filter((_, i) => i !== idx) }));

  // Generate a reference portrait straight from the written description —
  // no real photo needed. The result joins the photos like an upload would.
  const [portraitBusy, setPortraitBusy] = useState(null);
  const genPortrait = async (c) => {
    if (!settings.geminiKey) {
      window.alert(t('err.noGeminiKey'));
      return;
    }
    if (!(c.description || '').trim() && !(c.name || '').trim()) {
      window.alert(t('char.portraitNeedsDesc'));
      return;
    }
    setPortraitBusy(c.id);
    try {
      let prompt = '';
      if (imageStyle?.trim()) prompt += `Visual style: ${imageStyle.trim()}\n\n`;
      prompt += `Character reference portrait of ${c.name || 'the character'}${c.role ? ` (${c.role})` : ''}: ${c.description || ''}

One single person, chest-up portrait, face fully visible and evenly lit, looking slightly off-camera, plain unobtrusive background, no text, no watermarks. Render the face, hair and distinguishing features precisely and unambiguously — this image becomes the character's visual reference for every future shot.`;
      const raw = await generateImage(settings, { prompt, aspectRatio: '1:1', imageSize: '1K' });
      const dataURL = await resizeDataURL(raw, 640 * 640, 0.8); // reference-photo size
      const photos = [...(c.photos || []), dataURL].slice(0, 3);
      updateChar(c.id, { photos });
      syncToLibrary(c, photos);
    } catch (e) {
      window.alert(e.message || String(e));
    } finally {
      setPortraitBusy(null);
    }
  };

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
          {t('err.noGeminiKey')} <button title={t('tip.openSettings')} className="btn small" onClick={onSettings}>{t('err.openSettings')}</button>
        </div>
      );
    if (coverErr === 'NO_KEY')
      return (
        <div className="note warn">
          {t('err.noKey')} <button title={t('tip.openSettings')} className="btn small" onClick={onSettings}>{t('err.openSettings')}</button>
        </div>
      );
    return <div className="note error">{t('err.failed')} {coverErr}</div>;
  };

  return (
    <section className="stage">
      <h2 className="stage-h2" data-tip={t('s2.desc')}>{t('s2.title')}</h2>

      <details className="context-box">
        <summary>{t('s2.approvedPlot')}</summary>
        <p>{project.approvedPlot}</p>
      </details>

      <div className="row">
        <button title={t('tip.s2Generate')} className="btn primary" disabled={busy} onClick={generate}>
          {!storyline && <Stars size={14} />} {busy ? t('gen.generating') : storyline ? t('s2.regenerate') : t('s2.generate')}
        </button>
      </div>
      <ErrorNote error={error} onSettings={onSettings} />

      {storyline && (
        <>
          <div className="cover-block">
            <div className="cover-row">
              <div className="cover-col">
                <label>{t('cover.label')}</label>
                <div className="cover-frame">
                  {project.cover ? (
                    <img decoding="async" loading="lazy" className="cover-preview" src={project.cover} alt={t('cover.label')} />
                  ) : (
                    <div className="cover-placeholder">{coverBusy ? '…' : '16:9'}</div>
                  )}
                  {project.cover && (
                    <div className="img-actions">
                      <button
                        type="button"
                        className="img-icon-btn"
                        title={t('cover.regenerate')}
                        aria-label={t('cover.regenerate')}
                        disabled={coverBusy}
                        onClick={genCover}
                      >
                        <RestoreIcon size={14} />
                      </button>
                    </div>
                  )}
                  {coverBusy && <div className="cover-loading">{t('cover.generating')}</div>}
                </div>
                {!project.cover && (
                  <button title={t('tip.cover')} className="btn small" disabled={coverBusy} onClick={genCover}>
                    {!project.cover && <Stars size={14} />} {coverBusy ? t('cover.generating') : t('cover.generate')}
                  </button>
                )}
              </div>
              <div className="cover-side">
                <StylePicker project={project} update={rawUpdate || update} styles={styles} />
                <p className="hint stylepick-hint">{t('stylepick.hint')}</p>
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
              getText={() => storyline.synopsis}
              onReplace={setSynopsis}
            />
          </div>

          <div className="section-head">
            <label title={t('chelp.intro')}>{t('s2.characters')}</label>
            <button type="button" className="help-btn" title={t('chelp.open')} aria-label={t('chelp.open')} onClick={() => setCharHelp(true)}>
              ?
            </button>
          </div>
          {storyline.characters.map((c) => (
            <div key={c.id} className="char-card">
              <div className="row">
                <input
                  className="grow"
                  value={c.name}
                  placeholder={t('s2.name')}
                  title={t('chint.name')}
                  onChange={(e) => updateChar(c.id, { name: e.target.value })}
                />
                <input
                  className="grow"
                  value={c.role}
                  placeholder={t('s2.role')}
                  title={t('chint.role')}
                  onChange={(e) => updateChar(c.id, { role: e.target.value })}
                />
                <button title={t('tip.removeChar')} className="btn danger small" onClick={() => removeChar(c.id)}>✕</button>
              </div>
              <AutoTextarea
                minRows={3}
                value={c.description}
                placeholder={t('s2.charDesc')}
                title={t('chint.desc')}
                onChange={(e) => updateChar(c.id, { description: e.target.value })}
              />
              <label className="photos-label" title={t('chint.photos')}>{t('char.photos')}</label>
              <div className="photo-row">
                {(c.photos || []).map((ph, i) => (
                  <div key={i} className="photo-thumb">
                    <img decoding="async" loading="lazy" src={ph} alt="" title={t(i === 0 ? 'chint.photo1' : 'chint.photoN')} onClick={() => setLightbox({ kind: 'img', src: ph })} />
                    <button title={t('tip.removePhoto')} className="photo-x" onClick={() => removePhoto(c.id, i)}>✕</button>
                  </div>
                ))}
                {(c.photos || []).length < 3 && (
                  <>
                    <label className="photo-add" title={t('pick.upload')} aria-label={t('pick.upload')}>
                      <Upload size={20} />
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) addPhoto(c.id, f);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="photo-add"
                      title={t('pick.fromLib')}
                      aria-label={t('pick.fromLib')}
                      onClick={() => setPickFor(c.id)}
                    >
                      <Layers size={20} />
                    </button>
                    <button
                      type="button"
                      className="photo-add"
                      title={t('char.genPortrait')}
                      aria-label={t('char.genPortrait')}
                      disabled={portraitBusy === c.id}
                      onClick={() => genPortrait(c)}
                    >
                      {portraitBusy === c.id ? <span className="voice-dots">…</span> : <Stars size={20} />}
                    </button>
                  </>
                )}
                {(c.photos || []).length > 0 && (
                  <button title={t('tip.extract')} className="btn small" disabled={busy} onClick={() => extract(c)}>
                    <Stars size={14} />{busy ? t('gen.generating') : t('char.extract')}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Actor groups: characters that appear as ONE entity. A shot that
              names the group gets every member's photo as a reference. */}
          {/* both add-buttons sit right after the last character; what a group
              is lives in the hover hint, not on the page */}
          <div className="section-actions">
            <button title={t('tip.addChar')} className="btn small" onClick={addChar}>{t('s2.addChar')}</button>
            <button className="btn small" title={t('grp.hint')} onClick={addGroup}>{t('grp.add')}</button>
          </div>

          {groups.length > 0 && (
            <div className="section-head">
              <label title={t('grp.hint')}>{t('grp.title')}</label>
            </div>
          )}
          {groups.map((g) => {
            const members = (g.memberIds || []).map((id) => storyline.characters.find((c) => c.id === id)).filter(Boolean);
            return (
              <div key={g.id} className="char-card group-card">
                <div className="row">
                  <input
                    className="grow"
                    value={g.name}
                    placeholder={t('grp.name')}
                    onChange={(e) => patchGroup(g.id, { name: e.target.value })}
                  />
                  <button className="btn danger small" title={t('grp.remove')} aria-label={t('grp.remove')} onClick={() => removeGroup(g.id)}>✕</button>
                </div>
                <AutoTextarea
                  minRows={2}
                  value={g.description}
                  placeholder={t('grp.desc')}
                  onChange={(e) => patchGroup(g.id, { description: e.target.value })}
                />
                <label className="photos-label">{t('grp.members', { n: members.length })}</label>
                <div className="grp-members">
                  {storyline.characters.map((c) => {
                    const on = (g.memberIds || []).includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`grp-member ${on ? 'on' : ''}`}
                        aria-pressed={on}
                        title={on ? t('grp.removeMember') : t('grp.addMember')}
                        onClick={() => toggleMember(g.id, c.id)}
                      >
                        {c.photos?.[0] ? <img src={c.photos[0]} alt="" /> : <span className="grp-nophoto">?</span>}
                        <span className="grp-member-name">{c.name || t('s2.name')}</span>
                      </button>
                    );
                  })}
                  <button type="button" className="btn small" title={t('grp.newMemberTip')} onClick={() => addMember(g.id)}>
                    {t('grp.newMember')}
                  </button>
                </div>
                {members.some((c) => !c.photos?.[0]) && <p className="hint">{t('grp.noPhoto')}</p>}
              </div>
            );
          })}
        </>
      )}

      {pickFor && (
        <LibraryPicker
          kind="character"
          library={library}
          onPick={(entry) => pickFromLibrary(pickFor, entry)}
          onClose={() => setPickFor(null)}
        />
      )}

      <footer className="stage-footer">
        <button title={t('tip.continue')} className="btn primary big" disabled={!storyline || !storyline.synopsis.trim()} onClick={goNext}>
          {t('s2.continue')}
        </button>
      </footer>
      {charHelp && <CharacterHelp onClose={() => setCharHelp(false)} />}
      <Lightbox item={lightbox} onClose={() => setLightbox(null)} />
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useGenerate } from '../lib/useGenerate.js';
import { generateImage } from '../lib/gemini.js';
import { generateJSON, textKeyError } from '../lib/claude.js';
import { generateComfyVideo, generateComfyImage, saveToLocalOutputs, VIDEO_RESOLUTIONS } from '../lib/comfy.js';
import { stage5Prompt, stage5VideoPrompt, stage5AudioPrompt, finalFramePrompt } from '../lib/prompts.js';
import { useI18n } from '../lib/i18n.js';
import { aspectDescription } from '../lib/aspect.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import { StyleIndicator } from '../components/StyleControls.jsx';
import DynamicsVisualizer from '../components/DynamicsVisualizer.jsx';
import { blockForScene, DYNAMICS_CONFIG } from '../lib/dynamics.js';
import AssetsModal from '../components/AssetsModal.jsx';
import LibraryPicker from '../components/LibraryPicker.jsx';
import { newLibraryEntry } from '../lib/library.js';
import { fileToResizedDataURL, resizeDataURL } from '../lib/images.js';
import { extractPalette } from '../lib/palette.js';
import { Download, RestoreIcon, MapPin, Upload, Layers, Grid, Trash } from '../components/icons.jsx';

const readFileDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });

// Pill toggle with an animated switch knob (the Apply block).
function SwitchPill({ on, disabled, title, label, extra, onToggle }) {
  return (
    <button
      type="button"
      className={`sw-pill ${on ? 'on' : ''}`}
      disabled={disabled}
      aria-pressed={on}
      title={title}
      onClick={onToggle}
    >
      <span className="sw-track">
        <span className="sw-knob" />
      </span>
      <span className="sw-lbl">{label}</span>
      {extra}
    </button>
  );
}

// "Create Final Frame" glyph (corner brackets + lens).
const FinalFrameIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 5V3.5A1.5 1.5 0 0 1 3.5 2H5M11 2h1.5A1.5 1.5 0 0 1 14 3.5V5M14 11v1.5a1.5 1.5 0 0 1-1.5 1.5H11M5 14H3.5A1.5 1.5 0 0 1 2 12.5V11" />
    <circle cx="8" cy="8" r="2" />
  </svg>
);

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

export default function Stage5({ project, update, settings, onSettings, onProjectSettings, genLang, styles, imageStyle, videoStyle, library, libUpsert, libDelete, goNext }) {
  const { t } = useI18n();
  const [sceneId, setSceneId] = useState(project.outline[0]?.id || null);
  const [prog, setProg] = useState(null);
  const [refPrefs, setRefPrefs] = useState({}); // shotId -> { char, loc }
  const [imgBusy, setImgBusy] = useState(null); // shotId being generated
  const [imgErr, setImgErr] = useState(null); // { id, msg }
  const [refineText, setRefineText] = useState({}); // shotId -> instruction draft
  const [locSaved, setLocSaved] = useState(null); // shotId whose location ref was just saved
  const [showAssets, setShowAssets] = useState(false); // asset library manager
  const [assetPickFor, setAssetPickFor] = useState(null); // shotId choosing an asset
  const [pickLoc, setPickLoc] = useState(false); // scene location picker
  const [mediaProg, setMediaProg] = useState(null); // { a, b } scene-media queue
  const mediaCancel = useRef(false);
  const [palette, setPalette] = useState(null); // { src: shotId, colors: [] } for this scene
  const [lightbox, setLightbox] = useState(null); // dataURL shown in the large pop-up

  // Always-fresh project reference: generation handlers (and especially the
  // scene-media queue, which runs across many state updates) must read prompts
  // and frames at CALL time, never from a render-time closure — a stale
  // closure is exactly how an edited video prompt got ignored on regeneration.
  const projectRef = useRef(project);
  projectRef.current = project;
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const { busy, error, runMany, runBatch } = useGenerate(settings);

  const scene = project.outline.find((s) => s.id === sceneId) || project.outline[0];
  const shots = (scene && project.sceneDetails[scene.id]?.shots) || [];
  const hasPrompts = shots.some((s) => project.shotPrompts[s.id]);

  // Reference photos available for this scene.
  const charRefs = (project.storyline?.characters || [])
    .map((c) => c.photos?.[0])
    .filter(Boolean)
    .slice(0, 3);
  const locRefs = (scene?.photos || []).slice(0, 6);
  const videoRes = VIDEO_RESOLUTIONS.includes(project.videoResolution) ? project.videoResolution : 'HD';

  // Assets attached to a shot, resolved from the global library (dropping any
  // that were deleted). Used in image generation alongside char/loc refs.
  const assetsFor = (shotId) =>
    ((project.shotAssets || {})[shotId] || [])
      .map((id) => (library || []).find((e) => e.id === id && e.kind === 'asset'))
      .filter((a) => a && a.photos?.length);

  const attachAsset = (shotId, assetId) =>
    update((p) => {
      const cur = (p.shotAssets || {})[shotId] || [];
      if (cur.includes(assetId)) return {};
      return { shotAssets: { ...(p.shotAssets || {}), [shotId]: [...cur, assetId] } };
    });

  const detachAsset = (shotId, assetId) =>
    update((p) => ({
      shotAssets: { ...(p.shotAssets || {}), [shotId]: ((p.shotAssets || {})[shotId] || []).filter((id) => id !== assetId) },
    }));

  // Direct upload from a shot: create a named asset in the library (named after
  // the file, editable later) and attach it to the shot.
  const uploadAsset = async (shotId, file) => {
    try {
      const url = await fileToResizedDataURL(file);
      const entry = {
        ...newLibraryEntry('asset'),
        name: (file.name || '').replace(/\.[^.]+$/, '').slice(0, 40) || t('asset.untitled'),
        photos: [url],
        projectId: project.id,
        projectTitle: project.title,
      };
      libUpsert(entry);
      attachAsset(shotId, entry.id);
    } catch (e) {
      window.alert(e.message || String(e));
    }
  };

  // Shot images route through the selected service: Gemini (default) or the
  // local ComfyUI Flux.2 Klein 9B workflow (max 2 reference images).
  const useComfyImg = settings.imageService === 'comfy';
  const runImageGen = async ({ prompt, images, ratio, name }) => {
    if (useComfyImg) {
      const res = await generateComfyImage(settings, { prompt, images, aspectRatio: ratio, name });
      saveToLocalOutputs(settings, res.filename, res.dataURL); // best-effort local copy
      return res.dataURL;
    }
    return generateImage(settings, { prompt, images, aspectRatio: ratio, imageSize: '2K' });
  };
  // Missing image-service credentials/setup, or null when ready to generate.
  const imageKeyError = () => (!useComfyImg && !settings.geminiKey ? 'NO_GEMINI_KEY' : null);

  const prefFor = (shotId) => refPrefs[shotId] || { char: true, loc: true, asset: true, palette: true };
  const setPref = (shotId, patch) =>
    setRefPrefs((prev) => ({
      ...prev,
      [shotId]: { char: true, loc: true, asset: true, palette: true, ...prev[shotId], ...patch },
    }));

  // Scene palette: quantized from the scene's FIRST generated frame; applied
  // to later frames (toggleable per shot) to keep the grading consistent.
  const paletteSrcShot = shots.find((s) => (project.shotImages || {})[s.id]);
  const paletteSrcImg = paletteSrcShot ? project.shotImages[paletteSrcShot.id] : null;
  useEffect(() => {
    let alive = true;
    if (!paletteSrcImg) {
      setPalette(null);
      return undefined;
    }
    extractPalette(paletteSrcImg, 5).then((colors) => {
      if (alive) setPalette(colors.length ? { src: paletteSrcShot.id, colors } : null);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteSrcImg, scene?.id]);

  // Scene location references (same data Stage 4 edits: scene.photos).
  const updateScenePhotos = (photos) =>
    update((p) => ({
      outline: p.outline.map((s) => (s.id === scene.id ? { ...s, photos } : s)),
    }));
  const syncLocationToLibrary = (photos) => {
    if (!libUpsert || !photos.length) return;
    libUpsert({
      id: `libl_${project.id}_${scene.id}`,
      kind: 'location',
      name: scene.title || '',
      type: 'other',
      description: scene.summary || '',
      photos,
      projectId: project.id,
      projectTitle: project.title,
      createdAt: Date.now(),
    });
  };
  const addScenePhotos = async (files) => {
    try {
      const urls = [];
      for (const f of files) urls.push(await fileToResizedDataURL(f));
      const photos = [...(scene.photos || []), ...urls].slice(0, 6);
      updateScenePhotos(photos);
      syncLocationToLibrary(photos);
    } catch (e) {
      window.alert(e.message);
    }
  };

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
    const block = blockForScene(project.dynamicsPlan, sceneArg.number);
    return [
      stage5Prompt(project, sceneArg, sceneShots, genLang, imageStyle),
      stage5VideoPrompt(project, sceneArg, sceneShots, videoStyle, block),
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

  // Per-shot timing straight from Stage 5 (same 2–10s / 0.5s-step rules as the
  // Stage 4 and Stage 6 timelines; writes into the shared sceneDetails).
  const setShotDur = (shotId, d) => {
    const dur = Math.max(2, Math.min(10, Math.round(d * 2) / 2));
    update((p) => ({
      sceneDetails: {
        ...p.sceneDetails,
        [scene.id]: {
          shots: (p.sceneDetails[scene.id]?.shots || []).map((s) =>
            s.id === shotId ? { ...s, duration: dur } : s
          ),
        },
      },
    }));
  };

  // Audio prompts for the whole scene: character phrases verbatim with precise
  // in-shot timing, for an external audio-generation model.
  const applyAudio = (targetScene, data) =>
    update((p) => {
      const sceneShots = p.sceneDetails[targetScene.id]?.shots || [];
      const next = { ...p.shotPrompts };
      (data.prompts || []).forEach((pr) => {
        const sh = sceneShots[(Number(pr.shot) || 1) - 1];
        if (!sh) return;
        next[sh.id] = { imagePrompt: '', videoPrompt: '', ...next[sh.id], audioPrompt: pr.audio_prompt || '' };
      });
      return { shotPrompts: next };
    });

  const generateAudio = () => {
    const sceneArg = { ...scene, number: project.outline.indexOf(scene) + 1 };
    const block = blockForScene(project.dynamicsPlan, sceneArg.number);
    runMany([stage5AudioPrompt(project, sceneArg, shots, block)], (data) => applyAudio(scene, data));
  };

  // Generate the shot image via Gemini, attaching reference photos per the
  // checkboxes. Prompts and frames are read through projectRef so queued or
  // rapid regenerations always see the latest edits.
  const genImage = async (shot) => {
    const cur = projectRef.current;
    const prompt = cur.shotPrompts[shot.id]?.imagePrompt?.trim();
    if (!prompt) return setImgErr({ id: shot.id, msg: t('img.needPrompt') });
    const keyMiss = imageKeyError();
    if (keyMiss) return setImgErr({ id: shot.id, msg: keyMiss });

    // Flux.2 Klein takes at most TWO reference images — budget them by
    // priority (characters, then location, then assets) so the attached set
    // and its description in the prompt always agree.
    const pref = prefFor(shot.id);
    let budget = useComfyImg ? 2 : Number.POSITIVE_INFINITY;
    const take = (arr) => {
      const out = arr.slice(0, Math.max(0, budget));
      budget -= out.length;
      return out;
    };
    const useChar = take(pref.char ? charRefs : []);
    const useLoc = take(pref.loc ? locRefs : []);
    const shotAssets = take(pref.asset ? assetsFor(shot.id) : []);
    const useAssets = shotAssets.map((a) => a.photos[0]);
    const images = [...useChar, ...useLoc, ...useAssets];
    const pal = paletteRef.current;
    const usePalette = pref.palette && pal?.colors?.length && shot.id !== pal.src;

    let text = '';
    if (imageStyle?.trim()) text += `Visual style: ${imageStyle.trim()}\n\n`;
    text += prompt;
    if (images.length) {
      // Describe each reference group by its exact position in the list so the
      // model knows which images are characters, location and assets.
      text += `\n\n${images.length} reference image(s) are attached.`;
      let off = 0;
      const range = (n) => (n === 1 ? `image ${off + 1}` : `images ${off + 1}–${off + n}`);
      if (useChar.length) {
        text += ` The main character(s) appear in ${range(useChar.length)} — reproduce their faces and appearance faithfully and keep them consistent.`;
        off += useChar.length;
      }
      if (useLoc.length) {
        text += ` The location/environment is shown in ${range(useLoc.length)} — match its architecture, colors and lighting.`;
        off += useLoc.length;
      }
      if (useAssets.length) {
        const names = shotAssets
          .map((a) => (a.description ? `${a.name} (${a.description})` : a.name))
          .join('; ');
        text += ` ${range(useAssets.length)} show specific assets/props to include exactly as shown — ${names}. Place them naturally and keep their appearance accurate.`;
        off += useAssets.length;
      }
    }
    if (usePalette) {
      text += `\n\nSCENE COLOR PALETTE — grade this frame to match the scene's established palette (extracted from its first frame): ${pal.colors.join(', ')}. Keep hues, color temperature and overall tone consistent with that frame, unless the shot's action explicitly changes the lighting.`;
    }
    const ratio = project.aspectRatio || '16:9';
    text += `\n\nRender in ${aspectDescription(ratio)} (${ratio}) aspect ratio.`;

    setImgBusy(shot.id);
    setImgErr(null);
    try {
      const img = await runImageGen({
        prompt: text,
        images,
        ratio,
        name: `${(cur.title || 'project').slice(0, 24)}_sc${project.outline.indexOf(scene) + 1}_shot${shots.indexOf(shot) + 1}_frame`,
      });
      pushVersion(shot.id, img);
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message || String(e) });
    } finally {
      setImgBusy(null);
    }
  };

  // Upload a finished first frame (replaces generation; joins version history).
  const uploadShotImage = async (shot, file) => {
    try {
      const raw = await readFileDataURL(file);
      const img = await resizeDataURL(raw, Number.POSITIVE_INFINITY, 0.92);
      pushVersion(shot.id, img);
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message || String(e) });
    }
  };

  // Upload a finished shot video; its real duration is probed so the Stage-6
  // trim rules know how much raw material exists.
  const uploadShotVideo = async (shot, file) => {
    try {
      const dataURL = await readFileDataURL(file);
      const dur = await new Promise((res) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => res(Number.isFinite(v.duration) ? v.duration : 0);
        v.onerror = () => res(0);
        v.src = dataURL;
      });
      update((p) => ({
        shotVideos: { ...(p.shotVideos || {}), [shot.id]: dataURL },
        videoGenDurations: { ...(p.videoGenDurations || {}), [shot.id]: Math.round(dur * 10) / 10 },
      }));
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message || String(e) });
    }
  };

  // Drop the final frame — video generation reverts to first-frame-only (i2v).
  const deleteFinalFrame = (shot) =>
    update((p) => {
      const next = { ...(p.shotFinalImages || {}) };
      delete next[shot.id];
      return { shotFinalImages: next };
    });

  // New image becomes current; the previous current joins the history (max 5).
  const pushVersion = (shotId, img) =>
    update((p) => {
      const hist = { ...(p.shotImageHistory || {}) };
      const cur = (p.shotImages || {})[shotId];
      if (cur) hist[shotId] = [cur, ...(hist[shotId] || [])].slice(0, 5);
      return { shotImages: { ...p.shotImages, [shotId]: img }, shotImageHistory: hist };
    });

  // Remove one version from the shot's image history stack.
  const deleteVersion = (shotId, idx) =>
    update((p) => {
      const hist = [...((p.shotImageHistory || {})[shotId] || [])];
      hist.splice(idx, 1);
      return { shotImageHistory: { ...(p.shotImageHistory || {}), [shotId]: hist } };
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
    const keyMiss = imageKeyError();
    if (keyMiss) return setImgErr({ id: shot.id, msg: keyMiss });
    const ratio = project.aspectRatio || '16:9';
    const prompt = `Edit the attached image according to this instruction: ${instruction}. Keep the subject, composition and style unchanged except for the requested change. Maintain ${ratio} aspect ratio.`;
    setImgBusy(shot.id);
    setImgErr(null);
    try {
      const img = await runImageGen({
        prompt,
        images: [cur],
        ratio,
        name: `${(project.title || 'project').slice(0, 24)}_shot${shots.indexOf(shot) + 1}_refine`,
      });
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
    const keyErr = textKeyError(settings);
    if (keyErr) return setImgErr({ id: shot.id, msg: keyErr });
    const keyMiss = imageKeyError();
    if (keyMiss) return setImgErr({ id: shot.id, msg: keyMiss });
    const sceneArg = { ...scene, number: project.outline.indexOf(scene) + 1 };
    setImgBusy(`${shot.id}:final`);
    setImgErr(null);
    try {
      const data = await generateJSON(settings, finalFramePrompt(project, sceneArg, shot, first, genLang));
      const wanted = (data.characters_to_add || []).map((n) => String(n).toLowerCase());
      // Flux.2 Klein takes 2 references total; the first frame occupies one
      // slot, leaving room for a single missing-character photo.
      const missingRefs = (project.storyline?.characters || [])
        .filter((c) => wanted.includes((c.name || '').toLowerCase()))
        .map((c) => ({ name: c.name, photo: c.photos?.[0] }))
        .filter((c) => c.photo)
        .slice(0, useComfyImg ? 1 : 3);

      const ratio = project.aspectRatio || '16:9';
      let text = `${data.image_prompt}\n\nThe FIRST attached image is the shot's first frame — edit it: keep the location, environment, lighting, camera angle and framing exactly as they are, and keep every character's appearance identical.`;
      if (missingRefs.length) {
        text += ` The ${missingRefs.length === 1 ? 'next attached image is a reference photo' : `next ${missingRefs.length} attached images are reference photos`} of ${missingRefs.map((c) => c.name).join(', ')} — these characters appear in the final frame; reproduce their faces and appearance faithfully.`;
      }
      text += `\n\nRender in ${aspectDescription(ratio)} (${ratio}) aspect ratio, matching the first frame's dimensions.`;

      const img = await runImageGen({
        prompt: text,
        images: [first, ...missingRefs.map((c) => c.photo)],
        ratio,
        name: `${(project.title || 'project').slice(0, 24)}_shot${shots.indexOf(shot) + 1}_final`,
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
    const keyMiss = imageKeyError();
    if (keyMiss) return setImgErr({ id: shot.id, msg: keyMiss });
    const ratio = project.aspectRatio || '16:9';
    const prompt = `Edit the attached image into a clean LOCATION REFERENCE plate. Remove ALL people, characters, animals and creatures from the frame, realistically reconstructing the environment behind them. Keep the location itself — architecture, interior/exterior details, furniture, props, colors, lighting, atmosphere and visual style — exactly as in the original. At the same time, zoom out: extend the frame boundaries in ALL directions (top, bottom, left and right) to reveal a bit more of the surrounding space beyond the original edges, seamlessly and plausibly continuing the environment, while keeping the exact same ${ratio} aspect ratio and camera perspective. No people, no text, no watermarks.`;
    setImgBusy(`${shot.id}:loc`);
    setImgErr(null);
    setLocSaved(null);
    try {
      const img = await runImageGen({
        prompt,
        images: [first],
        ratio,
        name: `${(project.title || 'project').slice(0, 24)}_shot${shots.indexOf(shot) + 1}_locref`,
      });
      update((p) => ({
        outline: p.outline.map((s) =>
          s.id === scene.id ? { ...s, photos: [...(s.photos || []), img].slice(-6) } : s
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
          photos: [...(scene.photos || []), img].slice(-6),
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

  // Generate every missing image and video for the current scene, one job at
  // a time (the GPU and the image API both prefer it). Reads state through
  // projectRef between jobs, so each video sees the frame generated just
  // before it. Failures are skipped; the queue continues.
  const processSceneMedia = async () => {
    mediaCancel.current = false;
    const list = shots;
    const planned =
      list.filter((s) => !(projectRef.current.shotImages || {})[s.id] && projectRef.current.shotPrompts[s.id]?.imagePrompt?.trim()).length +
      list.filter((s) => !(projectRef.current.shotVideos || {})[s.id] && projectRef.current.shotPrompts[s.id]?.videoPrompt?.trim()).length;
    if (!planned) return;
    let done = 0;
    setMediaProg({ a: 0, b: planned });
    for (const shot of list) {
      if (mediaCancel.current) break;
      const cur = projectRef.current;
      if (!(cur.shotImages || {})[shot.id] && cur.shotPrompts[shot.id]?.imagePrompt?.trim()) {
        await genImage(shot);
        done++;
        setMediaProg({ a: done, b: planned });
      }
    }
    for (const [i, shot] of list.entries()) {
      if (mediaCancel.current) break;
      const cur = projectRef.current;
      if (
        !(cur.shotVideos || {})[shot.id] &&
        cur.shotPrompts[shot.id]?.videoPrompt?.trim() &&
        (cur.shotImages || {})[shot.id]
      ) {
        await genVideo(shot, i);
        done++;
        setMediaProg({ a: done, b: planned });
      }
    }
    setMediaProg(null);
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
    // Read through projectRef: the prompt/frames must be the LATEST state at
    // call time (fixes regeneration using a stale video prompt after edits).
    const cur = projectRef.current;
    const first = (cur.shotImages || {})[shot.id];
    const vPrompt = (cur.shotPrompts[shot.id]?.videoPrompt || '').trim();
    if (!first || !vPrompt) return;
    const last = (cur.shotFinalImages || {})[shot.id] || null;
    setImgBusy(`${shot.id}:vid`);
    setImgErr(null);
    // +2s padding rule: generate longer than the timeline needs; Stage 6 trims
    // 15 frames from head and tail to mask AI ramp-up and tail degradation.
    const genDuration = Math.round(shot.duration || 4) + DYNAMICS_CONFIG.generation_padding_sec;
    try {
      const { dataURL, filename } = await generateComfyVideo(settings, {
        prompt: vPrompt,
        firstFrame: first,
        lastFrame: last,
        durationSec: genDuration,
        aspectRatio: project.aspectRatio || '16:9',
        resolution: cur.videoResolution || 'HD',
        name: `${(project.title || 'project').slice(0, 24)}_sc${project.outline.indexOf(scene) + 1}_shot${i + 1}`,
      });
      saveToLocalOutputs(settings, filename, dataURL); // best-effort local copy
      update((p) => ({
        shotVideos: { ...(p.shotVideos || {}), [shot.id]: dataURL },
        videoGenDurations: { ...(p.videoGenDurations || {}), [shot.id]: genDuration },
      }));
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
      <div className="stage-head-row">
        <h2>{t('s5.title')}</h2>
        <StyleIndicator project={project} styles={styles} cats={['image', 'video']} onClick={onProjectSettings} />
      </div>
      <p className="stage-desc">{t('s5.desc')}</p>
      <DynamicsVisualizer plan={project.dynamicsPlan} />

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
        {shots.length > 0 && (
          <button className="btn" disabled={busy || !!mediaProg || !!imgBusy} onClick={processSceneMedia}>
            {t('s5.genMedia')}
          </button>
        )}
        {shots.length > 0 && (
          <button className="btn" disabled={busy} onClick={generateAudio}>
            {t('s5.audioGen')}
          </button>
        )}
        {prog && <span className="total-badge">{t('batch.progress', { a: prog.a, b: prog.b })}</span>}
        {mediaProg && (
          <>
            <span className="total-badge">{t('s5.mediaProg', { a: mediaProg.a, b: mediaProg.b })}</span>
            <button className="btn small danger" onClick={() => { mediaCancel.current = true; }}>
              {t('s6.cancel')}
            </button>
          </>
        )}
        <span className="s5-resrow push-right" title={t('s5.resTip')}>
          <span className="s5-reslabel">{t('s5.resLabel')}</span>
          <span className="seg">
            {VIDEO_RESOLUTIONS.map((r) => (
              <button
                key={r}
                type="button"
                className={`seg-btn ${videoRes === r ? 'on' : ''}`}
                onClick={() => update({ videoResolution: r })}
              >
                {r}
              </button>
            ))}
          </span>
        </span>
        <button className="btn" onClick={() => setShowAssets(true)}>
          <Grid size={15} /> {t('asset.libBtn')}
        </button>
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
          const shotAssets = assetsFor(shot.id);
          const dur = Number(shot.duration || 4);
          return (
            <div key={shot.id} className="shot-card s5e-card">
              {/* Image section — split panels: prompt management left, image
                  generation right (layout per the approved reference). */}
              <div className="s5e">
                {/* LEFT — prompt management */}
                <div className="s5e-panel">
                  <div className="s5e-head">
                    <strong className="s5e-title">{t('s4.shot', { n: i + 1 })}</strong>
                    <span className="s5e-step" title={t('s5.durTip')}>
                      <button type="button" title={t('sb.shorter')} disabled={dur <= 2} onClick={() => setShotDur(shot.id, dur - 0.5)}>
                        −
                      </button>
                      <i>{dur.toFixed(1)}s</i>
                      <button type="button" title={t('sb.longer')} disabled={dur >= 10} onClick={() => setShotDur(shot.id, dur + 0.5)}>
                        +
                      </button>
                    </span>
                    <span className="s5e-type">{shot.shotType || '—'}</span>
                  </div>
                  <p className="s5e-action">{shot.action}</p>
                  <div className="s5e-div" />
                  <div className="prompt-head">
                    <label>{t('s5.img')}</label>
                    <CopyButton text={p.imagePrompt} />
                  </div>
                  <AutoTextarea
                    minRows={8}
                    className="s5e-prompt"
                    value={p.imagePrompt}
                    placeholder={t('s5.ph')}
                    onChange={(e) => setPrompt(shot.id, { imagePrompt: e.target.value })}
                  />
                  <div className="s5e-grow" />
                  <div>
                    <div className="s5e-eyebrow">{t('apply.title')}</div>
                    <div className="s5e-applyrow">
                      <SwitchPill
                        on={pref.char}
                        disabled={!charRefs.length}
                        title={t('img.useChar')}
                        label={t('apply.char')}
                        onToggle={() => setPref(shot.id, { char: !pref.char })}
                      />
                      <SwitchPill
                        on={pref.loc}
                        disabled={!locRefs.length}
                        title={t('img.useLoc')}
                        label={t('apply.loc')}
                        onToggle={() => setPref(shot.id, { loc: !pref.loc })}
                      />
                      <SwitchPill
                        on={pref.asset}
                        disabled={!assetsFor(shot.id).length}
                        title={t('img.useAssets')}
                        label={t('apply.assets')}
                        onToggle={() => setPref(shot.id, { asset: !pref.asset })}
                      />
                      <SwitchPill
                        on={pref.palette}
                        disabled={!palette || palette.src === shot.id}
                        title={t('img.paletteTip')}
                        label={t('apply.palette')}
                        extra={
                          palette ? (
                            <span className="pal-swatches">
                              {palette.colors.map((c) => (
                                <i key={c} style={{ background: c }} />
                              ))}
                            </span>
                          ) : null
                        }
                        onToggle={() => setPref(shot.id, { palette: !pref.palette })}
                      />
                    </div>
                  </div>
                </div>

                {/* RIGHT — image generation */}
                <div className="s5e-panel">
                  {genImg ? (
                    finalImg ? (
                      <div className="frame-pair">
                        <figure>
                          <div className="s5e-imgwrap">
                            <img src={genImg} alt="" className="zoomable" onClick={() => setLightbox(genImg)} />
                            <button type="button" className="s5e-dl" title={t('img.download')} onClick={() => downloadImage(shot, i)}>
                              <Download size={14} />
                            </button>
                          </div>
                          <figcaption>{t('img.first')}</figcaption>
                        </figure>
                        <figure>
                          <div className="s5e-imgwrap">
                            <img src={finalImg} alt="" className="zoomable" onClick={() => setLightbox(finalImg)} />
                            <div className="img-actions">
                              <IconAction title={t('img.finalRegen')} disabled={anyBusy} onClick={() => genFinalFrame(shot)}>
                                <RestoreIcon size={14} />
                              </IconAction>
                              <IconAction title={t('img.downloadFinal')} onClick={() => downloadImage(shot, i, true)}>
                                <Download size={14} />
                              </IconAction>
                              <IconAction title={t('img.finalDelete')} disabled={anyBusy} onClick={() => deleteFinalFrame(shot)}>
                                <Trash size={14} />
                              </IconAction>
                            </div>
                          </div>
                          <figcaption>{t('img.final')}</figcaption>
                        </figure>
                      </div>
                    ) : (
                      <div className="s5e-imgwrap">
                        <img src={genImg} alt="" className="zoomable" onClick={() => setLightbox(genImg)} />
                        <button type="button" className="s5e-dl" title={t('img.download')} onClick={() => downloadImage(shot, i)}>
                          <Download size={14} />
                        </button>
                        {/* Version stack hovers over the preview; ✕ removes a variant. */}
                        {((project.shotImageHistory || {})[shot.id] || []).length > 0 && (
                          <div className="s5e-vers-overlay">
                            <span>{t('ver.label')}</span>
                            {((project.shotImageHistory || {})[shot.id] || []).map((v, vi) => (
                              <span
                                key={vi}
                                className="s5e-ver"
                                role="button"
                                tabIndex={0}
                                title={t('ver.restore')}
                                onClick={() => restoreVersion(shot.id, vi)}
                                onKeyDown={(e) => e.key === 'Enter' && restoreVersion(shot.id, vi)}
                              >
                                <img src={v} alt="" />
                                <span
                                  className="s5e-ver-x"
                                  role="button"
                                  title={t('ver.delete')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteVersion(shot.id, vi);
                                  }}
                                >
                                  ✕
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="s5-media-empty">{t('s5.noImg')}</div>
                  )}

                  {/* Versions under the frame pair (the small first frame has no room for an overlay). */}
                  {genImg && finalImg && ((project.shotImageHistory || {})[shot.id] || []).length > 0 && (
                    <div className="s5e-vers">
                      <span>{t('ver.label')}</span>
                      {((project.shotImageHistory || {})[shot.id] || []).map((v, vi) => (
                        <span
                          key={vi}
                          className="s5e-ver"
                          role="button"
                          tabIndex={0}
                          title={t('ver.restore')}
                          onClick={() => restoreVersion(shot.id, vi)}
                          onKeyDown={(e) => e.key === 'Enter' && restoreVersion(shot.id, vi)}
                        >
                          <img src={v} alt="" />
                          <span
                            className="s5e-ver-x"
                            role="button"
                            title={t('ver.delete')}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteVersion(shot.id, vi);
                            }}
                          >
                            ✕
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="s5e-btnrow">
                    <button
                      className="btn small primary s5e-gen"
                      disabled={anyBusy || !p.imagePrompt}
                      onClick={() => genImage(shot)}
                    >
                      {imgBusy === shot.id ? t('img.generating') : genImg ? t('img.regenerate') : t('img.generate')}
                    </button>
                    <label className="s5e-ico" title={t('img.uploadTip')} aria-label={t('img.uploadTip')}>
                      <Upload size={16} />
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) uploadShotImage(shot, f);
                        }}
                      />
                    </label>
                    {genImg && !finalImg && (
                      <button
                        type="button"
                        className="s5e-ico"
                        title={t('img.finalCreate')}
                        aria-label={t('img.finalCreate')}
                        disabled={anyBusy}
                        onClick={() => genFinalFrame(shot)}
                      >
                        <FinalFrameIcon />
                      </button>
                    )}
                    {genImg && (
                      <button
                        type="button"
                        className="s5e-ico"
                        title={t('img.locRef')}
                        aria-label={t('img.locRef')}
                        disabled={anyBusy}
                        onClick={() => makeLocationRef(shot)}
                      >
                        <MapPin size={16} />
                      </button>
                    )}
                    {(finalBusy || locBusy) && <span className="hint">{t('img.generating')}</span>}
                    {locSaved === shot.id && <span className="hint">{t('img.locSaved')}</span>}
                  </div>

                  <div className="voice-row refine-row">
                    <input
                      value={refineText[shot.id] || ''}
                      placeholder={t('ver.refinePh')}
                      disabled={!genImg}
                      onChange={(e) => setRefineText((v) => ({ ...v, [shot.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && refineImage(shot)}
                    />
                    <button
                      className="btn small s5e-refine"
                      disabled={!genImg || imgBusy === shot.id || !(refineText[shot.id] || '').trim()}
                      onClick={() => refineImage(shot)}
                    >
                      {imgBusy === shot.id ? t('img.generating') : t('ver.refine')}
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

                  <div className="s5e-grow" />
                  <div className="s5e-div" />
                  <div className="s5e-refgrid">
                    <div>
                      <label className="photos-label">{t('asset.shotLabel')}</label>
                      <div className="photo-row">
                        {shotAssets.map((a) => (
                          <div key={a.id} className="photo-thumb asset-thumb-sm" title={a.name}>
                            <img src={a.photos[0]} alt="" />
                            <span className="asset-tag">{a.name}</span>
                            <button className="photo-x" onClick={() => detachAsset(shot.id, a.id)}>✕</button>
                          </div>
                        ))}
                        <label className="photo-add" title={t('pick.upload')} aria-label={t('pick.upload')}>
                          <Upload size={20} />
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (f) uploadAsset(shot.id, f);
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="photo-add"
                          title={t('asset.fromLib')}
                          aria-label={t('asset.fromLib')}
                          onClick={() => setAssetPickFor(shot.id)}
                        >
                          <Layers size={20} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="photos-label">{t('scene.photos')}</label>
                      <div className="photo-row">
                        {(scene?.photos || []).map((ph, j) => (
                          <div key={j} className="photo-thumb">
                            <img src={ph} alt="" />
                            <button
                              className="photo-x"
                              onClick={() => updateScenePhotos((scene.photos || []).filter((_, k) => k !== j))}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {(scene?.photos || []).length < 6 && (
                          <>
                            <label className="photo-add" title={t('pick.upload')} aria-label={t('pick.upload')}>
                              <Upload size={20} />
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                hidden
                                onChange={(e) => {
                                  const fs = [...(e.target.files || [])];
                                  e.target.value = '';
                                  if (fs.length) addScenePhotos(fs);
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              className="photo-add"
                              title={t('pick.fromLib')}
                              aria-label={t('pick.fromLib')}
                              onClick={() => setPickLoc(true)}
                            >
                              <Layers size={20} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Video section — same split grid: prompt left, video right. */}
              <div className="s5e s5e-section">
                <div className="s5e-panel">
                  <div className="prompt-head">
                    <label>{t('s5.vid', { d: dur })}</label>
                    <CopyButton text={p.videoPrompt} />
                  </div>
                  <AutoTextarea
                    minRows={6}
                    className="s5e-prompt"
                    value={p.videoPrompt}
                    placeholder={t('s5.ph')}
                    onChange={(e) => setPrompt(shot.id, { videoPrompt: e.target.value })}
                  />
                </div>
                <div className="s5e-panel">
                  {shotVid ? (
                    <div className="s5e-imgwrap vid-wrap">
                      <video src={shotVid} controls preload="metadata" />
                      <button type="button" className="s5e-dl" title={t('vid.download')} onClick={() => downloadVideo(shot, i)}>
                        <Download size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="s5-media-empty">
                      {!genImg ? t('vid.needFrame') : finalImg ? t('vid.modeFLF') : t('vid.modeI2V')}
                    </div>
                  )}
                  <div className="s5e-btnrow">
                    <button
                      className="btn small primary s5e-gen"
                      disabled={anyBusy || !p.videoPrompt?.trim() || !genImg}
                      onClick={() => genVideo(shot, i)}
                    >
                      {vidBusy ? t('vid.generating') : shotVid ? t('vid.regenerate') : t('vid.generate')}
                    </button>
                    <label className="s5e-ico" title={t('vid.uploadTip')} aria-label={t('vid.uploadTip')}>
                      <Upload size={16} />
                      <input
                        type="file"
                        accept="video/*"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) uploadShotVideo(shot, f);
                        }}
                      />
                    </label>
                    {shotVid && genImg && (
                      <span className="hint">{finalImg ? t('vid.modeFLF') : t('vid.modeI2V')}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Audio section — only when the shot carries character dialogue
                  (or an audio prompt already exists); aligned to the same grid. */}
              {((shot.dialogue || '').trim() || (p.audioPrompt || '').trim()) && (
                <div className="s5e s5e-section">
                  <div className="s5e-panel">
                    <div className="prompt-head">
                      <label>{t('s5.aud')}</label>
                      <CopyButton text={p.audioPrompt || ''} />
                    </div>
                    <AutoTextarea
                      minRows={4}
                      className="s5e-prompt s5e-prompt-sm"
                      value={p.audioPrompt || ''}
                      placeholder={t('s5.audPh')}
                      onChange={(e) => setPrompt(shot.id, { audioPrompt: e.target.value })}
                    />
                  </div>
                  <div className="s5e-cellpad" />
                </div>
              )}
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

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" onClick={(e) => e.stopPropagation()} />
          <button type="button" className="lightbox-x" aria-label="close" onClick={() => setLightbox(null)}>
            ✕
          </button>
        </div>
      )}
      {showAssets && (
        <AssetsModal
          library={library}
          libUpsert={libUpsert}
          libDelete={libDelete}
          onClose={() => setShowAssets(false)}
        />
      )}
      {assetPickFor && (
        <LibraryPicker
          kind="asset"
          library={library}
          onPick={(entry) => attachAsset(assetPickFor, entry.id)}
          onClose={() => setAssetPickFor(null)}
        />
      )}
      {pickLoc && (
        <LibraryPicker
          kind="location"
          library={library}
          onPick={(entry) => {
            const photos = [...(scene.photos || []), ...entry.photos].slice(0, 6);
            updateScenePhotos(photos);
          }}
          onClose={() => setPickLoc(false)}
        />
      )}
    </section>
  );
}

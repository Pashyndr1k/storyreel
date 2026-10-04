import { useAgentScope } from '../lib/agent/registry.js';
import { generateKlingVideo, klingModelOf, klingSeconds, KLING_VIDEO_MODES, resolveKlingMode } from '../lib/kling.js';
import { SHOT_MIN_SEC, SHOT_MAX_SEC, SHOT_STEP_SEC, MAX_IMAGE_VERSIONS, MAX_CHARACTER_REFS, MAX_LOCATION_PHOTOS } from '../lib/config.js';
import { shotCastRefs } from '../lib/castRefs.js';
import { CAMERA_LEVELS, ACTION_LEVELS, cameraOf, actionOf, dynamicsStale } from '../lib/shotDynamics.js';
import GenProgress from '../components/GenProgress.jsx';
import { etaKey, expectedSeconds, recordRun } from '../lib/videoEta.js';
import { POLICY_EVENT } from '../lib/policy.js';

// fired when the user stops a video job; the assembly stage's auto queue stops with it
export const QUEUE_STOP_EVENT = 'storyreel:queue-stop';
import { locationsOf, shotLocations, shotLocationRefs, locationLibId } from '../lib/sceneLocations.js';
import { useEffect, useRef, useState } from 'react';
import { useGenerate } from '../lib/useGenerate.js';
import { generateImage, generateGeminiVoice, GEMINI_VOICES } from '../lib/gemini.js';
import { generateJSON, textKeyError } from '../lib/claude.js';
import { generateComfyVideo, generateComfyRefVideo, generateComfyMultiVideo, generateComfyImage, saveToLocalOutputs, VIDEO_RESOLUTIONS, VIDEO_MODES, H3_VIDEO_MODES, resolveVideoMode, resolveH3VideoMode, h3Seconds } from '../lib/comfy.js';
import { stage5Prompt, stage5VideoPrompt, stage5H3VideoPrompt, stage5KlingVideoPrompt, h3ComposePrompt, voiceSourceFor, stage5GeminiVoicePrompt, finalFramePrompt, tweakPromptSpec } from '../lib/prompts.js';
import { useI18n } from '../lib/i18n.js';
import { aspectDescription } from '../lib/aspect.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import { StyleChip } from '../components/StyleControls.jsx';
import DynamicsVisualizer from '../components/DynamicsVisualizer.jsx';
import SceneNav from '../components/SceneNav.jsx';
import { blockForScene, DYNAMICS_CONFIG } from '../lib/dynamics.js';
import AssetsModal from '../components/AssetsModal.jsx';
import SpatialModal from '../components/SpatialModal.jsx';
import { hasLayout, layoutEnabled } from '../lib/spatial/layout.js';
import Lightbox from '../components/Lightbox.jsx';
import RefPicker from '../components/RefPicker.jsx';
import KeyframePicker from '../components/KeyframePicker.jsx';
import { h3MultiPlan, keyframesOf, seedTakeKeyframes, hasMultiInput, h3Stamp } from '../lib/h3multi.js';
import { takeOf, isTakeMember, takeTotal, canCombine } from '../lib/takes.js';
import { padAudioWithSilence, mediaDuration, decodeMediaAudio, audioBufferToWavDataURL } from '../lib/audio.js';
import LibraryPicker from '../components/LibraryPicker.jsx';
import { newLibraryEntry } from '../lib/library.js';
import { fileToResizedDataURL, resizeDataURL } from '../lib/images.js';
import { extractPalette } from '../lib/palette.js';
import { Download, RestoreIcon, MapPin, Upload, Layers, Grid, Trash, Stars, Zap, Expand, Mic, StopSq, Chevron, Copy, Check, Box } from '../components/icons.jsx';

const readFileDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });


// A Stage-4 shot's dialogue must always survive into its Stage-5 audio prompt.
// Split the dialogue into spoken lines (dropping an optional "NAME:" label) and
// compare against the model's audio prompt with case/punctuation ignored; any
// spoken line the model dropped is appended verbatim so the dialogue is never
// lost even if the LLM omits it.

// Appended to every image-generation prompt: the described scene must fill the
// whole canvas — no black bars / letterboxing / empty margins at any edge.
const FULL_FRAME_RULE =
  'CRITICAL FRAMING: the described scene must fill the ENTIRE image edge to edge and occupy 100% of the canvas. Do NOT add black bars, letterboxing, pillarboxing, borders, frames, margins or any blank/empty areas at any edge — no black areas at the edges of the image.';

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

// "Upload Final Frame" glyph (corner brackets + up arrow).
const FinalFrameUploadIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 5V3.5A1.5 1.5 0 0 1 3.5 2H5M11 2h1.5A1.5 1.5 0 0 1 14 3.5V5M14 11v1.5a1.5 1.5 0 0 1-1.5 1.5H11M5 14H3.5A1.5 1.5 0 0 1 2 12.5V11" />
    <path d="M8 11V5.4M5.8 7.4 8 5.2l2.2 2.2" />
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
    // In the packaged app the main-process clipboard is the only reliable
    // path (navigator.clipboard is focus/permission-sensitive and rejects;
    // window.prompt does not exist in Electron). Browser builds fall back to
    // navigator.clipboard, then to a hidden textarea + execCommand.
    let ok = false;
    try {
      if (window.localFiles?.clipboardWrite) {
        await window.localFiles.clipboardWrite(text);
        ok = true;
      } else {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <button title={copied ? t('s5.copied') : t('tip.copy')} aria-label={t('tip.copy')} type="button" className={`prompt-regen prompt-copy ${copied ? 'done' : ''}`} disabled={!text} onClick={copy}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

// Since 2.5 this component is the per-shot / per-scene workbench embedded in
// the assembly stage (`embed`): the scene comes from the timeline selection
// (`focusSceneId`), and either one compact shot card (`focusShotId`) or the
// scene tools (no shot) are rendered — no scene nav, no header, no footer.
export default function Stage5({ project, update, settings, onSettings, onProjectSettings, genLang, styles, imageStyle, videoStyle, library, libUpsert, libDelete, goNext, embed = false, focusSceneId = null, focusShotId = null, onTabChange, imageStylePlus = false, onQueueApi = null, onPreviewFrame = null, previewFrame = 'first', setSettings = null }) {
  const { t } = useI18n();
  const [sceneIdState, setSceneId] = useState(project.outline[0]?.id || null);
  const sceneId = embed ? focusSceneId || project.outline[0]?.id || null : sceneIdState;
  // compact card: the prompt editor folds away under its head
  const [promptOpen, setPromptOpen] = useState(true);

  const [prog, setProg] = useState(null);
  const [refPrefs, setRefPrefs] = useState({}); // shotId -> { char, loc }
  const [imgBusy, setImgBusy] = useState(null); // shotId being generated
  const [imgErr, setImgErr] = useState(null); // { id, msg }
  const [refineText, setRefineText] = useState({}); // shotId -> instruction draft
  const vidAbort = useRef(null); // AbortController of the running video job
  const [vidProg, setVidProg] = useState(null); // running video job: { shotId, startedAt, expectedSec } — drives the button's progress bar
  const [locSaved, setLocSaved] = useState(null); // shotId whose location ref was just saved
  const [showAssets, setShowAssets] = useState(false); // asset library manager
  const [showLayout, setShowLayout] = useState(null); // 3D spatial layout: null = closed, else { shotId } to open on
  const [assetPickFor, setAssetPickFor] = useState(null); // shotId choosing an asset
  const [pickLoc, setPickLoc] = useState(null); // library picker for a new location: { shotId } (shotId null = scene panel)
  const [mediaProg, setMediaProg] = useState(null); // { a, b } scene-media queue
  const mediaCancel = useRef(false);
  const [palette, setPalette] = useState(null); // { src: shotId, colors: [] } for this scene
  const [lightbox, setLightbox] = useState(null);
  const [refPickFor, setRefPickFor] = useState(null);
  const [keyPickFor, setKeyPickFor] = useState(null); // shot whose keyframes are being edited // shot whose references are being edited // { kind: 'img' | 'vid', src } shown in the large pop-up
  const [tweakText, setTweakText] = useState({}); // `${shotId}:${kind}` -> adjustment draft
  const [tweakBusy, setTweakBusy] = useState(null); // `${shotId}:${kind}` in flight
  const [regenBusy, setRegenBusy] = useState(null); // `${shotId}:${kind}` single-prompt regen in flight
  const [shotTab, setShotTab] = useState({}); // shotId -> 'image' | 'video' | 'audio'
  // The host preview mirrors the focused shot's tab (image vs video).
  const focusTab = embed && focusShotId ? shotTab[focusShotId] || 'image' : null;
  useEffect(() => {
    if (embed && onTabChange) onTabChange(focusTab);
  }, [embed, focusTab, focusShotId, onTabChange]);

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
  // the workbench's actions, for the agent (same functions the buttons call)
  useAgentScope('bench', {
    projectId: project.id,
    sceneId: scene?.id || null,
    focusShotId: focusShotId || null,
    error,
    imgErr,
    createPrompts: () => runMany(specFor(scene), (data) => applyPrompts(scene, data)),
    regenPrompt: (shot, kind) => regenPrompt(shot, kind),
    genImage: (shot) => genImage(shot),
    genFinalFrame: (shot) => genFinalFrame(shot),
    genVideo: (shot, i) => genVideo(shot, i),
    genVoice: (shot, i) => genVoice(shot, i),
  });
  const hasPrompts = shots.some((s) => project.shotPrompts[s.id]);

  // Reference photos available for this scene.
  // Character references are picked per shot (lib/castRefs.js): the people
  // the shot names, up to MAX_CHARACTER_REFS.
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
  // With the scene's "palette from the previous scene" option on, the source
  // is the PREVIOUS scene's first frame instead — so this scene's first frame
  // (and the rest) carry the grading across the cut.
  const ownSrcShot = shots.find((s) => (project.shotImages || {})[s.id]);
  const ownSrcImg = ownSrcShot ? project.shotImages[ownSrcShot.id] : null;
  const sceneIdx = project.outline.findIndex((s) => s.id === scene?.id);
  const prevScene = sceneIdx > 0 ? project.outline[sceneIdx - 1] : null;
  const prevSrcShot = prevScene
    ? (project.sceneDetails[prevScene.id]?.shots || []).find((s) => (project.shotImages || {})[s.id]) || null
    : null;
  const prevSrcImg = prevSrcShot ? project.shotImages[prevSrcShot.id] : null;
  const [prevPalette, setPrevPalette] = useState(null); // { src: shotId, colors: [] } of the previous scene
  const setScenePalettePrev = (on) =>
    update((p) => ({ outline: p.outline.map((s) => (s.id === scene.id ? { ...s, palettePrev: on } : s)) }));
  useEffect(() => {
    let alive = true;
    if (!ownSrcImg) {
      setPalette(null);
      return undefined;
    }
    extractPalette(ownSrcImg, 5).then((colors) => {
      if (alive) setPalette(colors.length ? { src: ownSrcShot.id, colors } : null);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownSrcImg, scene?.id]);
  useEffect(() => {
    let alive = true;
    if (!prevSrcImg) {
      setPrevPalette(null);
      return undefined;
    }
    extractPalette(prevSrcImg, 5).then((colors) => {
      if (alive) setPrevPalette(colors.length ? { src: prevSrcShot.id, colors, fromPrev: true } : null);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevSrcImg, scene?.id]);
  // Shot 1 may follow the previous scene's palette (the scene's palettePrev
  // flag); every later shot follows this scene's own first frame.
  paletteRef.current = palette;
  const prevPaletteRef = useRef(prevPalette);
  prevPaletteRef.current = prevPalette;
  const isFirstShot = (shot) => shots[0]?.id === shot.id;

  // ---- scene locations. A scene holds any number of named locations; each
  // shot picks the ones it uses (the scene's first one unless chosen
  // otherwise). The library cards follow through useLibrarySync.
  const locations = locationsOf(scene);
  const setLocations = (fn) =>
    update((p) => ({
      outline: p.outline.map((s) => (s.id === scene.id ? { ...s, locations: fn(locationsOf(s)) } : s)),
    }));
  const patchLocation = (locId, patch) =>
    setLocations((ls) => ls.map((l) => (l.id === locId ? { ...l, ...(typeof patch === 'function' ? patch(l) : patch) } : l)));
  const usedLocIds = (shotId) => shotLocations(project, scene, shotId).map((l) => l.id);
  const toggleShotLocation = (shotId, locId) =>
    update((p) => {
      const sc = p.outline.find((s) => s.id === scene.id);
      const cur = shotLocations(p, sc, shotId).map((l) => l.id);
      const next = cur.includes(locId) ? cur.filter((id) => id !== locId) : [...cur, locId];
      return { shotLocations: { ...(p.shotLocations || {}), [shotId]: next } };
    });
  // A new location; when added from a shot card that shot starts using it.
  const addLocation = ({ name, photos, libId }, shotId = null) => {
    const id = `loc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    update((p) => {
      const sc = p.outline.find((s) => s.id === scene.id);
      const list = locationsOf(sc);
      const loc = {
        id,
        name: name || t('loc.defaultName', { n: list.length + 1 }),
        photos: photos.slice(0, MAX_LOCATION_PHOTOS),
        libId: libId || locationLibId(p.id, sc, id),
      };
      const patch = { outline: p.outline.map((s) => (s.id === scene.id ? { ...s, locations: [...list, loc] } : s)) };
      if (shotId) {
        // the first location of a scene is every shot's default already
        const cur = list.length ? shotLocations(p, sc, shotId).map((l) => l.id) : [];
        patch.shotLocations = { ...(p.shotLocations || {}), [shotId]: [...cur, id] };
      }
      return patch;
    });
  };
  const removeLocation = (loc) => {
    if (!window.confirm(t('loc.removeConfirm', { name: loc.name || t('loc.unnamed') }))) return;
    setLocations((ls) => ls.filter((l) => l.id !== loc.id));
  };
  const filesToPhotos = async (files) => {
    const urls = [];
    for (const f of files) urls.push(await fileToResizedDataURL(f));
    return urls;
  };
  const addLocationFromFiles = async (files, shotId = null) => {
    try {
      const name = (files[0]?.name || '').replace(/\.[^.]+$/, '').slice(0, 40);
      addLocation({ name, photos: await filesToPhotos(files) }, shotId);
    } catch (e) {
      window.alert(e.message);
    }
  };
  const addLocationPhotos = async (locId, files) => {
    try {
      const urls = await filesToPhotos(files);
      patchLocation(locId, (l) => ({ photos: [...(l.photos || []), ...urls].slice(0, MAX_LOCATION_PHOTOS) }));
    } catch (e) {
      window.alert(e.message);
    }
  };

  // Video prompts are written in the target model's own format (H3's
  // three-field schema vs LTX's motion-only prose), so the app remembers which
  // engine each prompt was written for and flags mismatches.
  const engineOf = (v) => (v === 'minimax' ? 'minimax' : v === 'kling' ? 'kling' : 'ltx');
  const curEngine = engineOf(settings.videoEngine);
  const engineName = (e) => (e === 'minimax' ? 'H3' : e === 'kling' ? 'Kling' : 'LTX');
  const engineHintName = curEngine === 'minimax' ? 'MiniMax H3' : curEngine === 'kling' ? klingModelOf(settings).label : 'LTX-2';
  // The video-prompt spec for an engine — each model has its own prompt
  // format (H3's three fields, LTX's motion prose, Kling's formula).
  const videoSpec = (engine, proj, sceneArg, sceneShots, block) =>
    engine === 'minimax'
      ? stage5H3VideoPrompt(proj, sceneArg, sceneShots, videoStyle, block)
      : engine === 'kling'
        ? stage5KlingVideoPrompt(proj, sceneArg, sceneShots, videoStyle, block, {
            seconds: (sh) => klingSeconds(klingModelOf(settings), Number(sh.duration) || 4),
            modelLabel: klingModelOf(settings).label,
            lastFrame: klingModelOf(settings).lastFrame,
          })
        : stage5VideoPrompt(proj, sceneArg, sceneShots, videoStyle, block);
  // image model the first-frame prompts are written for
  const imageModel = settings.imageService === 'comfy' ? 'comfy' : 'gemini';

  // Each generation is up to three calls (image, video, then audio prompts for
  // scenes with dialogue), each returning only its own field — so merge into
  // the existing entry, never overwrite the other fields.
  const applyPrompts = (targetScene, data) =>
    update((p) => {
      const sceneShots = p.sceneDetails[targetScene.id]?.shots || [];
      const next = { ...p.shotPrompts };
      const engines = { ...(p.shotPromptEngines || {}) };
      const dyn = { ...(p.shotPromptDyn || {}) };
      const blk = blockForScene(p.dynamicsPlan, p.outline.findIndex((s) => s.id === targetScene.id) + 1);
      (data.prompts || []).forEach((pr) => {
        const shot = sceneShots[(Number(pr.shot) || 1) - 1];
        if (!shot) return;
        const cur = next[shot.id] || {};
        next[shot.id] = {
          ...cur,
          imagePrompt: pr.image_prompt != null ? pr.image_prompt : cur.imagePrompt || '',
          videoPrompt: pr.video_prompt != null ? pr.video_prompt : cur.videoPrompt || '',
        };
        if (pr.video_prompt != null) {
          engines[shot.id] = curEngine;
          dyn[shot.id] = { camera: cameraOf(p, shot, blk), action: actionOf(p, shot, blk) };
        }
      });
      return { shotPrompts: next, shotPromptEngines: engines, shotPromptDyn: dyn };
    });

  const specFor = (s) => {
    const sceneArg = { ...s, number: project.outline.indexOf(s) + 1 };
    const sceneShots = project.sceneDetails[s.id]?.shots || [];
    const block = blockForScene(project.dynamicsPlan, sceneArg.number);
    const specs = [
      stage5Prompt(project, sceneArg, sceneShots, genLang, imageStyle, imageStylePlus, block, imageModel),
      videoSpec(curEngine, project, sceneArg, sceneShots, block),
    ];
    return specs;
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

  // Rewrite only this scene's video prompts in the current engine's format —
  // shown when some shots still carry prompts written for the other engine.
  const staleVideoPrompts = shots.some((sh) => {
    const w = (project.shotPromptEngines || {})[sh.id];
    return w && w !== curEngine && (project.shotPrompts[sh.id]?.videoPrompt || '').trim();
  });
  const regenVideoPrompts = () => {
    const sceneArg = { ...scene, number: project.outline.indexOf(scene) + 1 };
    const sceneShots = project.sceneDetails[scene.id]?.shots || [];
    const block = blockForScene(project.dynamicsPlan, sceneArg.number);
    const spec = videoSpec(curEngine, project, sceneArg, sceneShots, block);
    runMany([spec], (data) => applyPrompts(scene, data));
  };

  const setPrompt = (shotId, patch) =>
    update((p) => ({
      shotPrompts: {
        ...p.shotPrompts,
        [shotId]: { imagePrompt: '', videoPrompt: '', ...p.shotPrompts[shotId], ...patch },
      },
    }));

  // Regenerate ONE prompt (image / video / audio) of ONE shot. The scene-level
  // spec runs so video prompts keep their cross-shot momentum context and the
  // audio prompt sees the whole scene's chronology — but only the target
  // shot's field is applied from the response; everything else is untouched.
  // `over` carries a model the user has JUST picked in the prompt header —
  // the settings state has not re-rendered yet when the rewrite is offered.
  const regenPrompt = async (shot, kind, over = {}) => {
    if (regenBusy) return;
    const keyErr = textKeyError(settings);
    if (keyErr) return setImgErr({ id: shot.id, msg: keyErr });
    const cur = projectRef.current;
    const sceneArg = { ...scene, number: cur.outline.indexOf(scene) + 1 };
    const sceneShots = cur.sceneDetails[scene.id]?.shots || [];
    const block = blockForScene(cur.dynamicsPlan, sceneArg.number);
    const engine = over.engine || curEngine;
    const spec =
      kind === 'image'
        ? stage5Prompt(cur, sceneArg, sceneShots, genLang, imageStyle, imageStylePlus, block, over.imageModel || imageModel)
        : kind === 'video'
          ? videoSpec(engine, cur, sceneArg, sceneShots, block)
          : null;
    if (!spec) return;
    setRegenBusy(`${shot.id}:${kind}`);
    setImgErr(null);
    try {
      const data = await generateJSON(settings, spec);
      const idx = sceneShots.findIndex((s) => s.id === shot.id);
      const pr = (data.prompts || []).find((x) => (Number(x.shot) || 0) === idx + 1);
      const text = kind === 'image' ? pr?.image_prompt : pr?.video_prompt;
      if (typeof text !== 'string' || !text.trim()) throw new Error('The response held no prompt for this shot.');
      setPrompt(shot.id, { [kind === 'image' ? 'imagePrompt' : 'videoPrompt']: text });
      if (kind === 'video') {
        update((p) => {
          const blk = blockForScene(p.dynamicsPlan, p.outline.findIndex((s) => s.id === scene.id) + 1);
          return {
            shotPromptEngines: { ...(p.shotPromptEngines || {}), [shot.id]: engine },
            shotPromptDyn: { ...(p.shotPromptDyn || {}), [shot.id]: { camera: cameraOf(p, shot, blk), action: actionOf(p, shot, blk) } },
          };
        });
      }
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message || String(e) });
    } finally {
      setRegenBusy(null);
    }
  };

  // ---- shot dynamics: the camera and action sliders of the Video tab
  const sceneBlock = scene ? blockForScene(project.dynamicsPlan, project.outline.indexOf(scene) + 1) : null;
  const setDynamics = (shotId, key, value) =>
    update((p) => {
      const next = { ...(p[key] || {}) };
      if (value == null) delete next[shotId];
      else next[shotId] = value;
      return { [key]: next };
    });
  // A labelled block: the caption above a segmented selector with the same
  // height as the resolution selector. All buttons of a block are as wide as
  // its longest label (CSS grid), so no label ever wraps in any language.
  // The derived default is outlined until the user picks a segment; clicking
  // the picked segment again returns to it.
  const dynSlider = (shot, kind) => {
    const levels = kind === 'camera' ? CAMERA_LEVELS : ACTION_LEVELS;
    const key = kind === 'camera' ? 'shotCamera' : 'shotAction';
    const value = kind === 'camera' ? cameraOf(project, shot, sceneBlock) : actionOf(project, shot, sceneBlock);
    const manual = (project[key] || {})[shot.id] != null;
    return (
      <div className={`dyn-block dyn-${kind}`}>
        <span className="s5e-eyebrow" title={t(`tip.dyn_${kind}`)}>{t(`dyn.${kind}`)}</span>
        <span
          className={`seg seg-tall seg-compact dyn-seg ${manual ? '' : 'auto'}`}
          role="radiogroup"
          aria-label={t(`dyn.${kind}`)}
          style={{ '--n': levels.length }}
        >
        {levels.map((lv, k) => {
          const on = k === value;
          return (
            <button
              key={lv}
              type="button"
              role="radio"
              aria-checked={on}
              className={`seg-btn ${on ? 'on' : ''}`}
              title={`${t(`dyn.${kind}`)}: ${t(`dyn.${kind}_${lv}_tip`)}${on ? ` — ${t(manual ? 'tip.dynAuto' : 'tip.dynIsAuto')}` : ''}`}
              onClick={() => setDynamics(shot.id, key, on && manual ? null : k)}
            >
              {t(`dyn.${kind}_${lv}`)}
            </button>
          );
        })}
        </span>
      </div>
    );
  };

  // Compact card only: fold / unfold the prompt editor under its head.
  const promptToggle = () =>
    embed ? (
      <button
        type="button"
        className={`prompt-fold ${promptOpen ? 'open' : ''}`}
        title={promptOpen ? t('s5.foldPrompt') : t('s5.unfoldPrompt')}
        aria-label={promptOpen ? t('s5.foldPrompt') : t('s5.unfoldPrompt')}
        aria-expanded={promptOpen}
        onClick={() => setPromptOpen((v) => !v)}
      >
        <Chevron size={14} />
      </button>
    ) : null;

  // "Recreate prompt" text button in a prompt frame's header, next to the copy icon.
  const regenBtn = (shot, kind) => (
    <button
      type="button"
      className="copy-link prompt-recreate"
      title={t('s5.regenOne')}
      disabled={!!regenBusy}
      onClick={() => regenPrompt(shot, kind)}
    >
      {regenBusy === `${shot.id}:${kind}` ? t('s5.creatingPrompt') : t('dyn.recreate')}
    </button>
  );

  // Engine badge in the video prompt header: the prompt on screen was written
  // for the other engine's format — one click rewrites it for the current one.
  const promptEngineBadge = (shot) => {
    const written = (project.shotPromptEngines || {})[shot.id];
    if (!written || written === curEngine) return null;
    if (!(project.shotPrompts[shot.id]?.videoPrompt || '').trim()) return null;
    return (
      <button
        type="button"
        className="prompt-engine-badge"
        title={t('s5.engineMismatch', { a: engineName(written), b: engineName(curEngine) })}
        disabled={!!regenBusy}
        onClick={() => regenPrompt(shot, 'video')}
      >
        {engineName(written)} → {engineName(curEngine)}
      </button>
    );
  };

  // Model picker in a prompt's header. The choice is the app-wide generation
  // model (the same setting as in Settings): confirm first, then offer to
  // rewrite THIS shot's prompt in the new model's format.
  const IMAGE_MODELS = [['gemini', 'Nano Banana'], ['comfy', 'Flux.2 Klein']];
  const VIDEO_ENGINES = [['minimax', 'MiniMax H3'], ['ltx', 'LTX-2'], ['kling', klingModelOf(settings).label]];
  const pickModel = (shot, kind, value) => {
    if (!setSettings) return;
    const list = kind === 'image' ? IMAGE_MODELS : VIDEO_ENGINES;
    const label = (list.find(([v]) => v === value) || [])[1] || value;
    if (value === (kind === 'image' ? imageModel : curEngine)) return;
    if (!window.confirm(t(kind === 'image' ? 'mdl.confirmImage' : 'mdl.confirmVideo', { m: label }))) return;
    setSettings({ ...settings, ...(kind === 'image' ? { imageService: value } : { videoEngine: value }) });
    const has = (project.shotPrompts[shot.id]?.[kind === 'image' ? 'imagePrompt' : 'videoPrompt'] || '').trim();
    if (has && window.confirm(t('mdl.regenAsk', { m: label }))) {
      regenPrompt(shot, kind, kind === 'image' ? { imageModel: value } : { engine: value });
    }
  };
  const modelSelect = (shot, kind) =>
    setSettings ? (
      <select
        className="prompt-model"
        value={kind === 'image' ? imageModel : curEngine}
        title={t(kind === 'image' ? 'mdl.imageTip' : 'mdl.videoTip')}
        aria-label={t(kind === 'image' ? 'mdl.imageTip' : 'mdl.videoTip')}
        disabled={!!regenBusy}
        onChange={(e) => pickModel(shot, kind, e.target.value)}
      >
        {(kind === 'image' ? IMAGE_MODELS : VIDEO_ENGINES).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    ) : null;

  // "Tweak this": the user types a plain-language adjustment and Claude
  // rewrites the underlying technical prompt — no manual jargon editing.
  const tweakPrompt = async (shot, kind) => {
    const key = `${shot.id}:${kind}`;
    const field = kind === 'video' ? 'videoPrompt' : 'imagePrompt';
    const current = (projectRef.current.shotPrompts[shot.id]?.[field] || '').trim();
    const instruction = (tweakText[key] || '').trim();
    if (!current || !instruction) return;
    const keyErr = textKeyError(settings);
    if (keyErr) return setImgErr({ id: shot.id, msg: keyErr });
    setTweakBusy(key);
    setImgErr(null);
    try {
      const data = await generateJSON(settings, tweakPromptSpec(kind, current, instruction));
      const next = typeof data.prompt === 'string' ? data.prompt.trim() : '';
      if (!next) throw new Error('The prompt engineer returned no prompt.');
      setPrompt(shot.id, { [field]: next });
      setTweakText((v) => ({ ...v, [key]: '' }));
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message || String(e) });
    } finally {
      setTweakBusy(null);
    }
  };

  // Small adjustment row rendered directly below a prompt frame.
  const tweakRow = (shot, kind) => {
    const key = `${shot.id}:${kind}`;
    const field = kind === 'video' ? 'videoPrompt' : 'imagePrompt';
    const hasPrompt = !!(project.shotPrompts[shot.id]?.[field] || '').trim();
    return (
      <div className="voice-row refine-row tweak-row">
        <input
          value={tweakText[key] || ''}
          placeholder={t('tweak.ph')}
          disabled={!hasPrompt}
          onChange={(e) => setTweakText((v) => ({ ...v, [key]: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && tweakPrompt(shot, kind)}
        />
        <button title={t('tip.tweak')}
          className="btn small s5e-refine"
          disabled={tweakBusy === key || !hasPrompt || !(tweakText[key] || '').trim()}
          onClick={() => tweakPrompt(shot, kind)}
        >
          {tweakBusy === key ? t('tweak.busy') : t('tweak.btn')}
        </button>
      </div>
    );
  };

  // Per-shot timing straight from Stage 5 (same 2–10s / 0.5s-step rules as the
  // Stage 4 and assembly timelines; writes into the shared sceneDetails).
  const patchShot = (shotId, patch) =>
    update((p) => ({
      sceneDetails: {
        ...p.sceneDetails,
        [scene.id]: {
          ...(p.sceneDetails[scene.id] || {}),
          shots: (p.sceneDetails[scene.id]?.shots || []).map((s) => (s.id === shotId ? { ...s, ...patch } : s)),
        },
      },
    }));
  const setShotDur = (shotId, d) => patchShot(shotId, { duration: Math.max(SHOT_MIN_SEC, Math.min(SHOT_MAX_SEC, Math.round(d / SHOT_STEP_SEC) * SHOT_STEP_SEC)) });
  // The Stage-4 action text stays editable here — it is what the prompts and
  // the first-frame timing rule are written from.
  const setShotAction = (shotId, action) => patchShot(shotId, { action });

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
    // Characters: the people THIS shot names (or, if it names nobody, the
    // cast in list order) — each reference keeps its name for the prompt.
    const useCast = take(pref.char ? shotCastRefs(projectRef.current, shot) : []);
    const useChar = useCast.map((c) => c.photo);
    // Locations: the ones THIS shot uses, photos grouped per location.
    const locGroups = pref.loc ? shotLocationRefs(projectRef.current, projectRef.current.outline.find((s) => s.id === scene.id), shot.id) : [];
    const useLoc = take(locGroups.flatMap((g) => g.photos));
    const shotAssets = take(pref.asset ? assetsFor(shot.id) : []);
    const useAssets = shotAssets.map((a) => a.photos[0]);
    const images = [...useChar, ...useLoc, ...useAssets];
    // Shot 1: the previous scene's palette when the scene asks for it (no
    // own palette exists yet — it IS the source). Later shots: this scene's
    // first frame, toggleable per shot.
    const pal = isFirstShot(shot)
      ? (projectRef.current.outline.find((s) => s.id === scene.id)?.palettePrev ? prevPaletteRef.current : null)
      : paletteRef.current;
    const usePalette = !!pal?.colors?.length && (isFirstShot(shot) || (pref.palette && shot.id !== pal.src));

    let text = '';
    if (imageStyle?.trim()) {
      // image+ styles are binding style sheets: the model renders them
      // literally instead of treating them as a loose mood reference.
      text += imageStylePlus
        ? `Visual style (image+ — STRICT, apply literally and exhaustively; every listed medium, lighting, lens, palette, texture and reference term must be visible in the result, every "Avoid" item is prohibited): ${imageStyle.trim()}\n\n`
        : `Visual style: ${imageStyle.trim()}\n\n`;
    }
    text += prompt;
    if (images.length) {
      // Describe each reference group by its exact position in the list so the
      // model knows which images are characters, location and assets.
      text += `\n\n${images.length} reference image(s) are attached.`;
      let off = 0;
      const range = (n) => (n === 1 ? `image ${off + 1}` : `images ${off + 1}–${off + n}`);
      if (useChar.length) {
        // Name every face: with several people in frame the model must know
        // WHICH reference is WHO, not just that characters are attached.
        const who = useCast.map((c, k) => `image ${off + k + 1} is ${c.name || `character ${k + 1}`}${c.group && c.role ? ` (${c.role})` : ''}`).join(', ');
        // an actor group in the shot: its members are one entity, all present
        const byGroup = {};
        useCast.forEach((c, k) => {
          if (c.group) (byGroup[c.group] = byGroup[c.group] || []).push(off + k + 1);
        });
        const groupNote = Object.entries(byGroup)
          .map(([g, nums]) => ` Images ${nums.join(', ')} are the members of "${g}" — one group that appears together: show every one of these members in the frame, each with their own face, unless the prompt places only some of them.`)
          .join('');
        text += ` Character reference photos — ${who}. Reproduce each person's face, hair and appearance faithfully from their own photo, keep them clearly distinct from one another, and do not blend features between them.${groupNote}`;
        if (useCast[0]?.named) text += ' Only these characters appear in the frame (plus any unnamed background people the prompt describes).';
        off += useChar.length;
      }
      if (useLoc.length) {
        // budget-trimmed groups (Flux takes two references in total)
        let left = useLoc.length;
        const shown = locGroups
          .map((g) => {
            const n = Math.min(g.photos.length, left);
            left -= n;
            return { name: g.name, n };
          })
          .filter((g) => g.n);
        if (shown.length === 1) {
          text += ` The location/environment is shown in ${range(useLoc.length)} — match its architecture, colors and lighting.`;
          off += useLoc.length;
        } else {
          const parts = shown.map((g) => {
            const part = `${g.name ? `"${g.name}"` : 'a location'} in ${range(g.n)}`;
            off += g.n;
            return part;
          });
          text += ` The shot's locations/environments are shown as follows: ${parts.join('; ')}. Match each one's architecture, colors and lighting where the prompt places it.`;
        }
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
      text += pal.fromPrev
        ? `\n\nSCENE COLOR PALETTE — grade this frame to the palette of the PREVIOUS scene's first frame, so the cut between the scenes keeps one continuous look: ${pal.colors.join(', ')}. Keep hues, color temperature and overall tone consistent with that palette, unless the shot's action explicitly changes the lighting.`
        : `\n\nSCENE COLOR PALETTE — grade this frame to match the scene's established palette (extracted from its first frame): ${pal.colors.join(', ')}. Keep hues, color temperature and overall tone consistent with that frame, unless the shot's action explicitly changes the lighting.`;
    }
    const ratio = project.aspectRatio || '16:9';
    text += `\n\nRender in ${aspectDescription(ratio)} (${ratio}) aspect ratio.\n\n${FULL_FRAME_RULE}`;

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

  // Upload a ready-made FINAL frame (replaces a generated one if present) —
  // video generation then takes the first/last-frame path automatically.
  const uploadShotFinalImage = async (shot, file) => {
    try {
      const raw = await readFileDataURL(file);
      const img = await resizeDataURL(raw, Number.POSITIVE_INFINITY, 0.92);
      update((p) => ({ shotFinalImages: { ...(p.shotFinalImages || {}), [shot.id]: img } }));
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message || String(e) });
    }
  };

  // Upload a finished shot video; its real duration is probed so the assembly
  // trim rules know how much raw material exists.
  // Delete the shot's video (generated or uploaded) with what was derived
  // from it: its recorded length and engine, its trim, and the H3 sound clip
  // on the timeline. The prompt and the frames stay, so it can be made again.
  const deleteShotVideo = (shot) => {
    if (!window.confirm(t('vid.deleteConfirm'))) return;
    update((p) => {
      const drop = (map) => {
        const next = { ...(map || {}) };
        delete next[shot.id];
        return next;
      };
      return {
        shotVideos: drop(p.shotVideos),
        videoGenDurations: drop(p.videoGenDurations),
        shotVideoEngines: drop(p.shotVideoEngines),
        shotTrims: drop(p.shotTrims),
        audioLayers: (p.audioLayers || []).map((L) =>
          L.id === 'h3mix' ? { ...L, clips: (L.clips || []).filter((c) => c.id !== `h3_${shot.id}`) } : L
        ),
      };
    });
  };

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
        shotVideoEngines: { ...(p.shotVideoEngines || {}), [shot.id]: 'upload' },
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

  // Image versions are a STATIC list in creation order (oldest first);
  // shotImages[shotId] marks which one is selected — selecting never reorders.
  // Older projects stored the history newest-first WITHOUT the current image;
  // versionList normalizes that on read, and every write persists the new
  // format (the list contains all versions, the current one included).
  const versionList = (p, shotId) => {
    const hist = (p.shotImageHistory || {})[shotId] || [];
    const cur = (p.shotImages || {})[shotId];
    const list = !cur ? hist : hist.includes(cur) ? hist : [...[...hist].reverse(), cur];
    // Uploading the same file twice used to append a second identical entry;
    // the "current" ring then stuck to the first copy and the newer thumb
    // looked unselectable. Identical versions collapse into one (first kept).
    return list.filter((v, i) => list.indexOf(v) === i);
  };

  // A newly generated image appends to the right and becomes selected (max 6
  // versions kept — the oldest drops off). An image that is already a version
  // (e.g. the same file uploaded again) is selected instead of duplicated.
  const pushVersion = (shotId, img) =>
    update((p) => {
      const list = versionList(p, shotId);
      return {
        shotImages: { ...p.shotImages, [shotId]: img },
        shotImageHistory: {
          ...(p.shotImageHistory || {}),
          [shotId]: list.includes(img) ? list : [...list, img].slice(-MAX_IMAGE_VERSIONS),
        },
      };
    });

  // Select an existing version — order stays exactly as created.
  const selectVersion = (shotId, img) =>
    update((p) => ({
      shotImages: { ...p.shotImages, [shotId]: img },
      shotImageHistory: { ...(p.shotImageHistory || {}), [shotId]: versionList(p, shotId) },
    }));

  // Remove one version; deleting the selected one selects its neighbour.
  const deleteVersion = (shotId, idx) =>
    update((p) => {
      const list = versionList(p, shotId);
      const cur = (p.shotImages || {})[shotId];
      const removed = list[idx];
      const next = list.filter((_, i) => i !== idx);
      const patch = { shotImageHistory: { ...(p.shotImageHistory || {}), [shotId]: next } };
      if (removed === cur) {
        const repl = next[Math.min(idx, next.length - 1)];
        const imgs = { ...p.shotImages };
        if (repl) imgs[shotId] = repl;
        else delete imgs[shotId];
        patch.shotImages = imgs;
      }
      return patch;
    });

  // Version strip: a STATIC list in creation order — the very first image at
  // the start, newer versions appended to the right. Selecting highlights a
  // thumb (accent ring) without moving anything; clicking the selected thumb
  // zooms it; ✕ deletes any version.
  const renderVersions = (shot, genImg, cls) => {
    const list = versionList(project, shot.id);
    // A single generated frame is still shown — as the sole (selected) option.
    if (!genImg || list.length < 1) return null;
    const curIdx = list.indexOf(genImg);
    return (
      <div className={cls}>
        <span>{t('ver.label')}</span>
        {list.map((v, vi) => {
          const isCur = vi === curIdx;
          const act = () => {
            // a version click always brings the FIRST frame back into the preview
            if (previewFrame !== 'first') {
              onPreviewFrame?.('first');
              if (isCur) return;
            }
            if (isCur) setLightbox({ kind: 'img', src: v });
            else selectVersion(shot.id, v);
          };
          return (
            <span
              key={vi}
              className={`s5e-ver ${isCur ? 'cur' : ''}`}
              role="button"
              tabIndex={0}
              title={isCur ? t('ver.current') : t('ver.restore')}
              onClick={act}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } }}
            >
              <img decoding="async" loading="lazy" src={v} alt="" />
              <span
                className="s5e-ver-x"
                role="button"
                tabIndex={0}
                title={t('ver.delete')}
                aria-label={t('ver.delete')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteVersion(shot.id, vi);
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteVersion(shot.id, vi);
                }}
              >
                ✕
              </span>
            </span>
          );
        })}
      </div>
    );
  };

  // Edit-by-instruction: send the current image back to Nano Banana as the edit
  // reference with the user's refinement ("make it darker", "move camera lower").
  const refineImage = async (shot) => {
    const cur = (project.shotImages || {})[shot.id];
    const instruction = (refineText[shot.id] || '').trim();
    if (!cur || !instruction) return;
    const keyMiss = imageKeyError();
    if (keyMiss) return setImgErr({ id: shot.id, msg: keyMiss });
    const ratio = project.aspectRatio || '16:9';
    const prompt = `Edit the attached image according to this instruction: ${instruction}. Keep the subject, composition and style unchanged except for the requested change. Maintain ${ratio} aspect ratio.\n\n${FULL_FRAME_RULE}`;
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
        .slice(0, useComfyImg ? 1 : MAX_CHARACTER_REFS);
      // The shot's assets travel with the final frame too: the edit must keep
      // the SAME specific objects (a generic look-alike is exactly the failure
      // this prevents). Flux.2 Klein has one slot beside the first frame —
      // a missing character wins it over an asset.
      const pref = prefFor(shot.id);
      const assetRefs = pref.asset ? assetsFor(shot.id).filter((a) => a.photos?.[0]) : [];
      const room = useComfyImg ? Math.max(0, 1 - missingRefs.length) : Number.POSITIVE_INFINITY;
      const useAssets = assetRefs.slice(0, room);

      const ratio = project.aspectRatio || '16:9';
      let text = `${data.image_prompt}\n\nThe FIRST attached image is the shot's first frame — edit it: keep the location, environment, lighting, camera angle and framing exactly as they are, and keep every character's appearance identical.`;
      if (missingRefs.length) {
        text += ` The ${missingRefs.length === 1 ? 'next attached image is a reference photo' : `next ${missingRefs.length} attached images are reference photos`} of ${missingRefs.map((c) => c.name).join(', ')} — these characters appear in the final frame; reproduce their faces and appearance faithfully.`;
      }
      if (useAssets.length) {
        const off = 1 + missingRefs.length;
        const names = useAssets.map((a) => (a.description ? `${a.name} (${a.description})` : a.name)).join('; ');
        text += ` ${useAssets.length === 1 ? `Attached image ${off + 1} shows` : `Attached images ${off + 1}–${off + useAssets.length} show`} the exact assets/props of this shot — ${names}. Keep each one precisely as shown in its photo: the same specific object with the same shape, color, markings and details, never a generic substitute of the same kind.`;
      }
      text += `\n\nRender in ${aspectDescription(ratio)} (${ratio}) aspect ratio, matching the first frame's dimensions.\n\n${FULL_FRAME_RULE}`;

      const img = await runImageGen({
        prompt: text,
        images: [first, ...missingRefs.map((c) => c.photo), ...useAssets.map((a) => a.photos[0])],
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
    const prompt = `Edit the attached image into a clean LOCATION REFERENCE plate. Remove ALL people, characters, animals and creatures from the frame, realistically reconstructing the environment behind them. Keep the location itself — architecture, interior/exterior details, furniture, props, colors, lighting, atmosphere and visual style — exactly as in the original. At the same time, zoom out: extend the frame boundaries in ALL directions (top, bottom, left and right) to reveal a bit more of the surrounding space beyond the original edges, seamlessly and plausibly continuing the environment, while keeping the exact same ${ratio} aspect ratio and camera perspective. No people, no text, no watermarks.\n\n${FULL_FRAME_RULE}`;
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
      const target = shotLocations(projectRef.current, projectRef.current.outline.find((s) => s.id === scene.id), shot.id)[0];
      if (target) patchLocation(target.id, (l) => ({ photos: [...(l.photos || []), img].slice(-MAX_LOCATION_PHOTOS) }));
      else addLocation({ name: scene.title || '', photos: [img] }, shot.id);
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
  // `silent` skips the confirm (the assembly stage's auto queue confirms once
  // for the whole project); `onStep` reports each finished item to it.
  const processSceneMedia = async ({ silent = false, onStep = null, videosOnly = false } = {}) => {
    mediaCancel.current = false;
    const list = shots;
    const planned =
      (videosOnly ? 0 : list.filter((s) => !(projectRef.current.shotImages || {})[s.id] && projectRef.current.shotPrompts[s.id]?.imagePrompt?.trim()).length) +
      list.filter((s) => !(projectRef.current.shotVideos || {})[s.id] && projectRef.current.shotPrompts[s.id]?.videoPrompt?.trim()).length;
    if (!planned) return;
    // Each job occupies the GPU for minutes — never start the queue silently.
    if (!silent && !window.confirm(t('s5.genMediaConfirm', { n: planned }))) return;
    let done = 0;
    setMediaProg({ a: 0, b: planned });
    // the assembly stage's auto queue asks for videos only
    for (const shot of videosOnly ? [] : list) {
      if (mediaCancel.current) break;
      const cur = projectRef.current;
      if (!(cur.shotImages || {})[shot.id] && cur.shotPrompts[shot.id]?.imagePrompt?.trim()) {
        await genImage(shot);
        done++;
        setMediaProg({ a: done, b: planned });
        onStep?.();
      }
    }
    for (const [i, shot] of list.entries()) {
      if (mediaCancel.current) break;
      const cur = projectRef.current;
      if (
        !(cur.shotVideos || {})[shot.id] &&
        !isTakeMember(cur, shot.id) &&
        cur.shotPrompts[shot.id]?.videoPrompt?.trim() &&
        (cur.shotImages || {})[shot.id]
      ) {
        await genVideo(shot, i);
        if (mediaCancel.current) break; // interrupted, not finished
        done++;
        setMediaProg({ a: done, b: planned });
        onStep?.();
      }
    }
    setMediaProg(null);
  };
  // A content-policy refusal halts the queue: the remaining items are not started.
  useEffect(() => {
    const stop = () => {
      mediaCancel.current = true;
    };
    window.addEventListener(POLICY_EVENT, stop);
    return () => window.removeEventListener(POLICY_EVENT, stop);
  }, []);
  // The assembly stage's auto queue drives this scene queue scene by scene;
  // it needs the current scene's run/cancel every render (fresh closures).
  useEffect(() => {
    onQueueApi?.({
      sceneId: scene?.id || null,
      run: processSceneMedia,
      // abort from the assembly stage: no more jobs, and interrupts the job on the GPU
      cancel: () => {
        mediaCancel.current = true;
        vidAbort.current?.abort();
      },
    });
  });

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

  // Generate the shot video on the local ComfyUI. Dialogue shots with a
  // generated voice go through the LTX-2 sound+image workflow (talking video
  // with the voice track baked in, rendered at the EXACT shot duration so
  // assembly never trims into synced speech); otherwise first frame + prompt
  // through image-to-video, or first + final frame through the first/last-
  // frame workflow. The result plays inline and a copy lands in the local
  // outputs folder.
  // Stop the running video job: interrupts it on ComfyUI (or ends the wait
  // for Kling) and halts the scene queue and the auto queue with it.
  const stopVideo = () => {
    if (!vidAbort.current || !window.confirm(t('vid.stopConfirm'))) return;
    mediaCancel.current = true;
    window.dispatchEvent(new CustomEvent(QUEUE_STOP_EVENT));
    vidAbort.current?.abort();
  };

  const genVideo = async (shot, i) => {
    // Read through projectRef: the prompt/frames must be the LATEST state at
    // call time (fixes regeneration using a stale video prompt after edits).
    const cur = projectRef.current;
    // Take members are rendered inside their lead's generation.
    if (isTakeMember(cur, shot.id)) return;
    const take = takeOf(cur, shot.id);
    const takeDur = take ? takeTotal(cur, take) : 0;
    const first = (cur.shotImages || {})[shot.id];
    const vPrompt = (cur.shotPrompts[shot.id]?.videoPrompt || '').trim();
    if (!vPrompt) return;
    // MiniMax H3 wants its native three-field schema plus a reference-frame
    // alignment header. Prompts generated for H3 are stored as JSON fields;
    // an LTX-era plain prompt is passed through so nothing breaks mid-project.
    const isH3 = settings.videoEngine === 'minimax';
    const isKling = settings.videoEngine === 'kling'; // cloud API, first (+ last) frame
    const kModel = klingModelOf(settings);
    const last = (cur.shotFinalImages || {})[shot.id] || null;
    const voiceAud = (cur.shotAudios || {})[shot.id] || null;
    // A pinned workflow wins over the automatic choice (and silently falls
    // back to auto when its material is missing).
    const mode = (cur.shotVideoModes || {})[shot.id] || 'auto';
    const refs = (cur.shotRefs || {})[shot.id] || null;
    const hasRefs = !!refs && ((refs.images || []).length || (refs.videos || []).length || (refs.audios || []).length) > 0;
    // H3 has its own workflow set: it never takes audio in (it scores itself),
    // and reference mode replaces the first-frame anchor entirely.
    const hasKeyframes = hasMultiInput(cur, shot.id);
    const useMode = isH3
      ? resolveH3VideoMode(mode, { lastFrame: last, hasRefs, hasKeyframes })
      : isKling
        ? resolveKlingMode(mode, { lastFrame: last, model: kModel })
        : resolveVideoMode(mode, { lastFrame: last, audio: voiceAud });
    if (!first && useMode !== 'r2v' && useMode !== 'mfr') return; // every non-reference workflow is frame-anchored
    if (isKling && !(settings.klingKey || '').trim()) return setImgErr({ id: shot.id, msg: 'NO_KLING_KEY' });
    // one video job at a time (the GPU and the progress state are single)
    if (vidAbort.current) return;
    setImgErr(null);
    // +3s padding rule (silent workflows only): generate longer than the
    // timeline needs; the assembly timeline trims 15 frames from head and tail to mask AI
    // ramp-up and tail degradation. Voice-synced shots render at the exact
    // duration so assembly never trims into synced speech — and H3 counts as
    // voice-synced, because it generates its own dialogue, effects and score.
    const slotDur = take && isH3 ? takeDur : Number(shot.duration || 4);
    // Kling bills per second and anchors on the first frame: render the
    // model's nearest allowed length, no padding.
    const genDuration = isKling
      ? klingSeconds(kModel, slotDur)
      : useMode === 'si2v' || isH3
        ? slotDur
        : Math.round(shot.duration || 4) + DYNAMICS_CONFIG.generation_padding_sec;
    // progress estimate for the button, from how long this kind of job took before
    const runKey = etaKey(isKling ? 'kling' : isH3 ? 'minimax' : 'ltx', cur.videoResolution || 'HD', useMode);
    const runStart = Date.now();
    setVidProg({ shotId: shot.id, startedAt: runStart, expectedSec: expectedSeconds(runKey, genDuration) });
    const abort = new AbortController();
    vidAbort.current = abort;
    const runOpts = { signal: abort.signal };
    try {
      const sendPrompt =
        isH3 && useMode !== 'r2v' && useMode !== 'mfr'
          ? h3ComposePrompt(vPrompt, {
              hasFirst: true,
              hasLast: useMode === 'flf2v' && !!last,
              seconds: genDuration,
            })
          : vPrompt;
      const genArgs = {
        prompt: sendPrompt,
        durationSec: genDuration,
        aspectRatio: project.aspectRatio || '16:9',
        resolution: cur.videoResolution || 'HD',
        name: `${(project.title || 'project').slice(0, 24)}_sc${project.outline.indexOf(scene) + 1}_shot${i + 1}`,
      };
      const { dataURL, filename, seconds: klingSec } =
        isKling
          ? await generateKlingVideo(settings, {
              prompt: vPrompt,
              firstFrame: first,
              lastFrame: useMode === 'flf2v' ? last : null,
              durationSec: slotDur,
              resolution: cur.videoResolution || 'HD',
              name: genArgs.name,
            }, runOpts)
          : useMode === 'mfr'
          ? await generateComfyMultiVideo(settings, {
              ...genArgs,
              ...h3MultiPlan(cur, shot.id, { durationSec: genDuration }),
            }, runOpts)
          : useMode === 'r2v'
          ? await generateComfyRefVideo(settings, {
              ...genArgs,
              refImages: (refs.images || []).map((r) => r.src),
              refVideos: (refs.videos || []).map((r) => r.src),
              refAudios: (refs.audios || []).map((r) => r.src),
            }, runOpts)
          : await generateComfyVideo(settings, {
              ...genArgs,
              firstFrame: first,
              lastFrame: useMode === 'flf2v' ? last : null,
              audio: useMode === 'si2v' ? voiceAud : null,
              mode: useMode,
            }, runOpts);
      recordRun(runKey, (Date.now() - runStart) / 1000, genDuration);
      saveToLocalOutputs(settings, filename, dataURL); // best-effort local copy
      // H3 clips carry a full native mix (dialogue, effects, score). Detach it
      // onto the "H3 mix" lane NLE-style — video muted, audio on its own lane
      // at the same volume — so the assembly timeline can keep, kill or duck it.
      let mixBuf = null;
      if (isH3) {
        try {
          mixBuf = await decodeMediaAudio(dataURL);
        } catch {
          mixBuf = null; // no audio track — leave the clip as-is
        }
      }
      const mixWav = mixBuf ? audioBufferToWavDataURL(mixBuf) : null;
      update((p) => {
        const base = {
          shotVideos: { ...(p.shotVideos || {}), [shot.id]: dataURL },
          videoGenDurations: {
            ...(p.videoGenDurations || {}),
            [shot.id]: isKling ? klingSec || genDuration : isH3 ? Math.round(h3Seconds(genDuration) * 100) / 100 : genDuration,
          },
          shotVideoEngines: { ...(p.shotVideoEngines || {}), [shot.id]: isH3 ? 'minimax' : isKling ? 'kling' : 'ltx' },
        };
        if (!mixWav) return base;
        // timeline start = summed durations of every shot before this one
        let startAt = 0;
        outer: for (const sc of p.outline) {
          for (const sh of p.sceneDetails[sc.id]?.shots || []) {
            if (sh.id === shot.id) break outer;
            startAt += Number(sh.duration) || 0;
          }
        }
        const clip = {
          id: `h3_${shot.id}`,
          name: t('s6.h3Clip', { n: shot.number || '' }).trim(),
          dataURL: mixWav,
          start: startAt,
          offset: 0, // H3 trims tail-only, so the mix starts at the first frame
          duration: Math.min(slotDur || mixBuf.duration, mixBuf.duration),
          srcDuration: mixBuf.duration,
          fadeIn: 0,
          fadeOut: 0,
        };
        let Ls = [...(p.audioLayers || [])];
        const li = Ls.findIndex((L) => L.id === 'h3mix');
        if (li >= 0) {
          Ls[li] = { ...Ls[li], clips: [...Ls[li].clips.filter((c) => c.id !== clip.id), clip] };
        } else {
          const lane = { id: 'h3mix', name: t('s6.h3Lane'), enabled: true, volume: 1, clips: [clip] };
          const mi = Ls.findIndex((L) => L.id === 'bgmusic' || String(L.id).startsWith('bgm_'));
          if (mi >= 0) Ls.splice(mi, 0, lane);
          else Ls.push(lane);
        }
        return { ...base, audioLayers: Ls, shotMutes: { ...(p.shotMutes || {}), [shot.id]: true } };
      });
    } catch (e) {
      // stopped by the user: not an error
      if (e?.name !== 'AbortError') setImgErr({ id: shot.id, msg: e.message === 'COMFY_UNREACHABLE' ? 'COMFY_UNREACHABLE' : e.message || String(e) });
    } finally {
      vidAbort.current = null;
      setVidProg(null);
    }
  };

  // Voice audio via Gemini TTS. First run: Claude (the "voice director")
  // writes ONE controllable TTS prompt — audio profile, scene, director's
  // notes and the tagged transcript — from the SCENE CONTEXT (Action Dynamics
  // block as the emotional fallback) and casts 1-2 prebuilt voices. The
  // prompt is saved as editable text; later runs speak the current text.
  const draftVoicePrompt = async (shot) => {
    const cur = projectRef.current;
    const sceneArg = { ...scene, number: cur.outline.indexOf(scene) + 1 };
    const blockArg = blockForScene(cur.dynamicsPlan, sceneArg.number);
    const prev = cur.shotPrompts[shot.id]?.voiceParams || {};
    const data = await generateJSON(settings, stage5GeminiVoicePrompt(cur, sceneArg, shot, blockArg, genLang));
    const text = String(data.tts_prompt || '').trim();
    if (!text) throw new Error('The voice director returned no TTS prompt.');
    const speakers = (Array.isArray(data.speakers) ? data.speakers : [])
      .map((sp) => ({ speaker: String(sp.speaker || '').trim(), voiceName: String(sp.voice || sp.voiceName || '').trim() }))
      .filter((sp) => sp.voiceName)
      .slice(0, 2);
    const params = { ...prev, speakers, forDuration: Number(shot.duration) || 0 }; // paced for THIS length
    setPrompt(shot.id, { voicePrompt: text, voiceParams: params });
    return { text, ...params };
  };

  const redraftVoice = async (shot) => {
    const keyErr = textKeyError(settings);
    if (keyErr) return setImgErr({ id: shot.id, msg: keyErr });
    setImgBusy(`${shot.id}:audp`);
    setImgErr(null);
    try {
      await draftVoicePrompt(shot);
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message || String(e) });
    } finally {
      setImgBusy(null);
    }
  };

  const genVoice = async (shot, i) => {
    const cur = projectRef.current;
    const sp = cur.shotPrompts[shot.id] || {};
    // Reuse the saved prompt only if it is a Gemini draft (carries a cast);
    // anything older is redrafted.
    const draftedForService = (sp.voiceParams?.speakers || []).length > 0;
    // …and for the shot's CURRENT length: the SRT timestamps / pacing were
    // written for the duration at drafting time, so a retimed shot gets a
    // fresh draft instead of speech that ends early or overruns.
    const draftedForLength = Number(sp.voiceParams?.forDuration) === (Number(shot.duration) || 0);
    let voice = (sp.voicePrompt || '').trim() && draftedForService && draftedForLength
      ? { text: sp.voicePrompt.trim(), ...(sp.voiceParams || {}) }
      : null;
    if (!voice) {
      const keyErr = textKeyError(settings);
      if (keyErr) return setImgErr({ id: shot.id, msg: keyErr });
    }
    if (!settings.geminiKey) return setImgErr({ id: shot.id, msg: 'NO_GEMINI_KEY' });
    setImgBusy(`${shot.id}:aud`);
    setImgErr(null);
    try {
      if (!voice) voice = await draftVoicePrompt(shot);
      const name = `${(cur.title || 'project').slice(0, 24)}_sc${cur.outline.indexOf(scene) + 1}_shot${i + 1}_voice`;
      // A manually selected voice overrides the (dominant) first speaker.
      let speakers = (voice.speakers || []).slice(0, 2);
      if (voice.geminiVoice) {
        speakers = speakers.length
          ? [{ ...speakers[0], voiceName: voice.geminiVoice }, ...speakers.slice(1)]
          : [{ speaker: 'Narrator', voiceName: voice.geminiVoice }];
      }
      const dataURL = await generateGeminiVoice(settings, { prompt: voice.text, speakers });
      saveToLocalOutputs(settings, `${name}.wav`, dataURL); // best-effort local copy
      update((p) => ({
        shotAudios: { ...(p.shotAudios || {}), [shot.id]: dataURL },
        shotAudioSrc: { ...(p.shotAudioSrc || {}), [shot.id]: dataURL },
      }));
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message === 'COMFY_UNREACHABLE' ? 'COMFY_UNREACHABLE' : e.message || String(e) });
    } finally {
      setImgBusy(null);
    }
  };

  // ---- audio source, silence padding, upload and microphone recording -------
  // shotAudioSrc holds the RAW clip (generated / uploaded / recorded);
  // shotAudios holds what the app actually uses — the raw clip when no pads
  // are set, otherwise the rebuilt file with silence around it. Keeping the
  // raw clip means changing the pads never compounds silence.
  const audioSrcOf = (p, shotId) => (p.shotAudioSrc || {})[shotId] || (p.shotAudios || {})[shotId] || null;

  // Voice source (H3 dialogue shots only): 'tts' keeps the TTS pipeline —
  // H3 renders the delivery silently and the take is laid on the assembly timeline;
  // 'native' hands the line to H3's own voice, driven by the speaker notes.
  const voiceSourceOf = (shotId) => voiceSourceFor(project, shotId);
  const setVoiceSource = (shotId, v) =>
    update((p) => ({ shotVoiceSources: { ...(p.shotVoiceSources || {}), [shotId]: v } }));
  // Multi-shot takes (H3): combine 2-3 consecutive shots into one generation.
  const combineTake = (sceneShots, startIdx, count) => {
    const check = canCombine(project, scene.id, startIdx, count);
    if (!check.ok) {
      const shot = sceneShots[startIdx];
      setImgErr({ id: shot.id, msg: t(check.reason === 'long' ? 'take.tooLong' : 'take.blocked') });
      return;
    }
    update((p) => ({ shotGroups: { ...(p.shotGroups || {}), [check.ids[0]]: { shotIds: check.ids } } }));
  };
  const ungroupTake = (leadId) =>
    update((p) => {
      const next = { ...(p.shotGroups || {}) };
      delete next[leadId];
      return { shotGroups: next };
    });

  // Multi-frame keyframes (H3 MULTI mode): stills pinned to exact seconds.
  const keysOf = (shotId) => keyframesOf(project, shotId);
  const setKeyframes = (shotId, list) =>
    update((p) => ({ shotKeyframes: { ...(p.shotKeyframes || {}), [shotId]: list } }));
  // Switching a take lead to MULTI with no keyframes yet seeds the members'
  // first frames at the take's cut times — the whole point of the mode.
  const pickMode = (shot, m) => {
    update((pr) => ({ shotVideoModes: { ...(pr.shotVideoModes || {}), [shot.id]: m } }));
    if (m === 'mfr' && keysOf(shot.id).length === 0) {
      const take = takeOf(project, shot.id);
      if (take && take.shotIds[0] === shot.id) {
        const seeded = seedTakeKeyframes(project, take, t);
        if (seeded.length) setKeyframes(shot.id, seeded);
      }
    }
  };
  const refsOf = (shotId) => {
    const r = (project.shotRefs || {})[shotId];
    return r && ((r.images || []).length || (r.videos || []).length || (r.audios || []).length) ? r : null;
  };
  const nativeVoiceOn = (shot) =>
    curEngine === 'minimax' && (shot.dialogue || '').trim() !== '' && voiceSourceOf(shot.id) === 'native';
  const padsOf = (shotId) => {
    const raw = (project.shotAudioPads || {})[shotId] || {};
    return { lead: Number(raw.lead) || 0, tail: Number(raw.tail) || 0 };
  };
  const setPads = (shotId, patch) =>
    update((p) => {
      const cur = (p.shotAudioPads || {})[shotId] || {};
      const next = {
        lead: Math.max(0, Math.min(10, Number(patch.lead ?? cur.lead) || 0)),
        tail: Math.max(0, Math.min(10, Number(patch.tail ?? cur.tail) || 0)),
      };
      return { shotAudioPads: { ...(p.shotAudioPads || {}), [shotId]: next } };
    });

  // Store a new raw clip and make it the active audio (pads re-applied later
  // via "Update audio" so an import is instantly audible as-is).
  const setAudioSource = (shotId, dataURL) =>
    update((p) => ({
      shotAudioSrc: { ...(p.shotAudioSrc || {}), [shotId]: dataURL },
      shotAudios: { ...(p.shotAudios || {}), [shotId]: dataURL },
    }));

  const uploadAudio = async (shot, file) => {
    setImgErr(null);
    try {
      const dataURL = await readFileDataURL(file);
      setAudioSource(shot.id, dataURL);
      setPads(shot.id, { lead: 0, tail: 0 });
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message || String(e) });
    }
  };

  // Rebuild the working audio from the raw clip + the current pads. The shot
  // duration grows to fit the padded clip (never shrinks) so the talking-video
  // workflow, which renders voiced shots at the exact shot duration, keeps the
  // whole take including its silence.
  const applyAudioPads = async (shot) => {
    const cur = projectRef.current;
    const src = audioSrcOf(cur, shot.id);
    if (!src) return;
    const { lead, tail } = padsOf(shot.id);
    setImgBusy(`${shot.id}:audp`);
    setImgErr(null);
    try {
      const out = await padAudioWithSilence(src, lead, tail);
      const dur = await mediaDuration(out);
      update((p) => {
        const patch = {
          shotAudioSrc: { ...(p.shotAudioSrc || {}), [shot.id]: src },
          shotAudios: { ...(p.shotAudios || {}), [shot.id]: out },
        };
        const needed = Math.min(10, Math.ceil(dur * 10) / 10);
        if (dur > 0 && needed > (shot.duration || 0)) {
          patch.sceneDetails = {
            ...p.sceneDetails,
            [scene.id]: {
              shots: (p.sceneDetails[scene.id]?.shots || []).map((s) =>
                s.id === shot.id ? { ...s, duration: needed } : s
              ),
            },
          };
        }
        return patch;
      });
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message === 'AUDIO_UNDECODABLE' ? t('aud.padFailed') : e.message || String(e) });
    } finally {
      setImgBusy(null);
    }
  };

  // Microphone recording (system default input). Toggle: first click starts,
  // second stops and stores the take as the shot's audio source.
  const [recording, setRecording] = useState(null); // shotId being recorded
  const recRef = useRef(null); // { rec, stream, chunks }
  const stopRecording = () => {
    const r = recRef.current;
    if (r?.rec && r.rec.state !== 'inactive') r.rec.stop();
  };
  const toggleRecording = async (shot) => {
    if (recording === shot.id) {
      stopRecording();
      return;
    }
    if (recording) return; // another shot is recording
    setImgErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(
        (m) => window.MediaRecorder?.isTypeSupported?.(m)
      );
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        recRef.current = null;
        setRecording(null);
        if (!chunks.length) return;
        try {
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          const raw = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.onerror = () => rej(fr.error);
            fr.readAsDataURL(blob);
          });
          // Re-encode to WAV so ComfyUI (and ffmpeg) always get a format they
          // accept, whatever the browser recorded in.
          let dataURL = raw;
          try {
            dataURL = await padAudioWithSilence(raw, 0, 0);
          } catch {
            /* keep the original container */
          }
          setAudioSource(shot.id, dataURL);
          setPads(shot.id, { lead: 0, tail: 0 });
        } catch (e) {
          setImgErr({ id: shot.id, msg: e.message || String(e) });
        }
      };
      recRef.current = { rec, stream, chunks };
      rec.start();
      setRecording(shot.id);
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.name === 'NotAllowedError' ? t('aud.micDenied') : e.message || String(e) });
    }
  };
  // Never leave the microphone open when the stage unmounts.
  useEffect(() => () => {
    const r = recRef.current;
    if (r) {
      try {
        r.rec.state !== 'inactive' && r.rec.stop();
      } catch {
        /* already stopped */
      }
      r.stream?.getTracks?.().forEach((tr) => tr.stop());
    }
  }, []);

  const downloadAudio = (shot, i) => {
    const aud = (project.shotAudios || {})[shot.id];
    if (!aud) return;
    const safe = (project.title || 'shot').replace(/[^\w\d]+/g, '-');
    const a = document.createElement('a');
    a.href = aud;
    a.download = `${safe}-scene${project.outline.indexOf(scene) + 1}-shot${i + 1}-voice.mp3`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (!project.outline.length) {
    return (
      <section className="stage">
        <h2 title={t('s5.desc')}>{t('s5.title')}</h2>
        <div className="note warn">{t('s5.needOutline')}</div>
      </section>
    );
  }

  // "New location" tiles: from files, or linked to a library card.
  const newLocationTiles = (shotId) => (
    <>
      <label className="photo-add" title={t('loc.addUpload')} aria-label={t('loc.addUpload')}>
        <Upload size={20} />
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            const fs = [...(e.target.files || [])];
            e.target.value = '';
            if (fs.length) addLocationFromFiles(fs, shotId);
          }}
        />
      </label>
      <button type="button" className="photo-add" title={t('loc.addLib')} aria-label={t('loc.addLib')} onClick={() => setPickLoc({ shotId })}>
        <Layers size={20} />
      </button>
    </>
  );

  // Scene panel: every location of the scene with its name and photos.
  const sceneLocationsBlock = (
    <div className="s5-scenephotos">
      <label className="photos-label" title={t('tip.locations')}>{t('loc.label')}</label>
      {locations.map((loc) => (
        <div key={loc.id} className="loc-row">
          <div className="loc-head">
            <input
              className="loc-name"
              value={loc.name}
              placeholder={t('loc.namePh')}
              title={t('tip.locName')}
              onChange={(e) => patchLocation(loc.id, { name: e.target.value })}
            />
            <button type="button" className="s5e-ico" title={t('tip.locRemove')} aria-label={t('tip.locRemove')} onClick={() => removeLocation(loc)}>
              <Trash size={14} />
            </button>
          </div>
          <div className="photo-row">
            {(loc.photos || []).map((ph, j) => (
              <div key={j} className="photo-thumb">
                <img decoding="async" loading="lazy" src={ph} alt="" onClick={() => setLightbox({ kind: 'img', src: ph })} />
                <button title={t('tip.removePhoto')}
                  className="photo-x"
                  onClick={() => patchLocation(loc.id, (l) => ({ photos: (l.photos || []).filter((_, k) => k !== j) }))}
                >
                  ✕
                </button>
              </div>
            ))}
            {(loc.photos || []).length < MAX_LOCATION_PHOTOS && (
              <label className="photo-add" title={t('loc.addPhoto')} aria-label={t('loc.addPhoto')}>
                <Upload size={20} />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    const fs = [...(e.target.files || [])];
                    e.target.value = '';
                    if (fs.length) addLocationPhotos(loc.id, fs);
                  }}
                />
              </label>
            )}
          </div>
        </div>
      ))}
      <div className="loc-row">
        {locations.length > 0 && <span className="loc-new-label">{t('loc.new')}</span>}
        <div className="photo-row">{newLocationTiles(null)}</div>
      </div>
    </div>
  );

  // Shot card: the scene's locations as tiles (same tiles as the assets);
  // a click switches a location on or off for this shot.
  const shotLocationsBlock = (shot) => {
    const used = usedLocIds(shot.id);
    return (
      <div>
        <label className="photos-label" title={t('tip.locations')}>{t('loc.label')}</label>
        <div className="photo-row">
          {locations.map((loc) => {
            const on = used.includes(loc.id);
            return (
              <button
                key={loc.id}
                type="button"
                className={`photo-thumb asset-thumb-sm loc-tile ${on ? 'on' : ''}`}
                aria-pressed={on}
                title={`${loc.name || t('loc.unnamed')} — ${t(on ? 'tip.locOn' : 'tip.locOff')}`}
                onClick={() => toggleShotLocation(shot.id, loc.id)}
              >
                {loc.photos?.[0] ? <img decoding="async" loading="lazy" src={loc.photos[0]} alt="" /> : <MapPin size={20} />}
                <span className="asset-tag">{loc.name || t('loc.unnamed')}</span>
              </button>
            );
          })}
          {newLocationTiles(shot.id)}
        </div>
      </div>
    );
  };

  const Root = embed ? 'div' : 'section';
  const focusShot = embed && focusShotId ? shots.find((sh) => sh.id === focusShotId) : null;
  const showSceneTools = !embed || !focusShot;
  const visibleShots = embed ? (focusShot ? [focusShot] : []) : shots;

  return (
    <Root className={embed ? `s5-embed ${promptOpen ? '' : 'prompt-collapsed'}` : 'stage'}>
      {!embed && (
        <>
          <div className="stage-head-row">
            <h2 className="stage-h2" data-tip={t('s5.desc')}>{t('s5.title')}</h2>
          </div>

          <SceneNav
            outline={project.outline}
            currentId={scene.id}
            isDone={(s) => {
              const sShots = project.sceneDetails[s.id]?.shots || [];
              return sShots.length > 0 && sShots.every((sh) => project.shotPrompts[sh.id]);
            }}
            onSelect={setSceneId}
          />
        </>
      )}

      {embed && showSceneTools && (
        <div className="s5-scenehead">
          <strong className="s5e-title">
            {project.outline.indexOf(scene) + 1}. {scene.title || t('s4.untitled')}
          </strong>
          <StyleChip project={project} styles={styles} cat="image" onClick={onProjectSettings} />
          <StyleChip project={project} styles={styles} cat="video" onClick={onProjectSettings} />
        </div>
      )}

      {showSceneTools && (
      <div className="row s5-scenerow">
        {shots.length > 0 && (
          <button title={t('tip.s5Generate')} className="btn primary" disabled={busy} onClick={generate}>
            {!hasPrompts && <Stars size={14} />} {busy && !prog ? t('gen.generating') : hasPrompts ? t('s5.regenerate') : t('s5.generate', { n: shots.length })}
          </button>
        )}
        <button title={t('tip.batch5')} className="btn" disabled={busy} onClick={processAll}>{t('batch.run5')}</button>
        {staleVideoPrompts && (
          <button className="btn" disabled={busy} onClick={regenVideoPrompts} title={t('s5.updateEngineTip', { e: engineName(curEngine) })}>
            {t('s5.updateEngine', { e: engineName(curEngine) })}
          </button>
        )}
        {prog && <span className="total-badge" title={t('ind.batchProgress')}>{t('batch.progress', { a: prog.a, b: prog.b })}</span>}
        {mediaProg && (
          <>
            <span className="total-badge" title={t('ind.mediaProgress')}>{t('s5.mediaProg', { a: mediaProg.a, b: mediaProg.b })}</span>
            <button title={t('tip.cancelQueue')} className="btn small danger" onClick={() => { mediaCancel.current = true; }}>
              {t('s6.cancel')}
            </button>
          </>
        )}
        {shots.length > 0 && (
          <button
            type="button"
            className="icon-btn sq42 push-right"
            title={t('s5.genMedia')}
            aria-label={t('s5.genMedia')}
            disabled={busy || !!mediaProg || !!imgBusy || !!vidProg}
            onClick={processSceneMedia}
          >
            <Zap size={16} />
          </button>
        )}
        {layoutEnabled(project) && shots.length > 0 && (
          <button
            type="button"
            className={`icon-btn sq42 ${hasLayout(project, scene.id) ? 'has-layout' : ''}`}
            title={t('tip.spOpen')}
            aria-label={t('tip.spOpen')}
            onClick={() => setShowLayout({ shotId: null })}
          >
            <Box size={16} />
          </button>
        )}
        <button
          type="button"
          className={`icon-btn sq42 ${shots.length ? '' : 'push-right'}`}
          title={t('asset.libBtn')}
          aria-label={t('asset.libBtn')}
          onClick={() => setShowAssets(true)}
        >
          <Grid size={16} />
        </button>
        <DynamicsVisualizer plan={project.dynamicsPlan} />
      </div>
      )}
      {embed && showSceneTools && sceneLocationsBlock}
      <ErrorNote error={error} onSettings={onSettings} />

      {shots.length === 0 ? (
        <div className="note warn">{t('s5.noShots')}</div>
      ) : embed && !focusShot ? null : (
        visibleShots.map((shot) => {
          const i = shots.indexOf(shot);
          const p = project.shotPrompts[shot.id] || { imagePrompt: '', videoPrompt: '' };
          const pref = prefFor(shot.id);
          const genImg = (project.shotImages || {})[shot.id];
          const finalImg = (project.shotFinalImages || {})[shot.id];
          const finalBusy = imgBusy === `${shot.id}:final`;
          const locBusy = imgBusy === `${shot.id}:loc`;
          // The video job has its own state (vidProg): the shared imgBusy is
          // overwritten by any image/voice action on another shot, which used
          // to hide a running video's progress.
          const vidBusy = vidProg?.shotId === shot.id;
          const vidElsewhere = !!vidProg && !vidBusy; // a video is running on another shot
          const audBusy = imgBusy === `${shot.id}:aud` || imgBusy === `${shot.id}:audp`;
          const anyBusy = imgBusy === shot.id || finalBusy || locBusy || vidBusy || audBusy;
          const shotVid = (project.shotVideos || {})[shot.id];
          const shotAud = (project.shotAudios || {})[shot.id];
          const shotAssets = assetsFor(shot.id);
          const dur = Number(shot.duration || 4);
          // One compact frame per shot: header + three generation tabs. The
          // audio tab exists only when the shot carries dialogue (or already
          // has audio material).
          const hasAudioTab = !!(
            (shot.dialogue || '').trim() ||
            (p.voicePrompt || '').trim() ||
            shotAud
          );
          const tabList = ['image', 'video', ...(hasAudioTab ? ['audio'] : [])];
          const tab = tabList.includes(shotTab[shot.id]) ? shotTab[shot.id] : 'image';
          const tabHasMedia = { image: !!genImg, video: !!shotVid, audio: !!shotAud };
          // pinned workflow + the one that will actually run for this shot
          const shotMode = (project.shotVideoModes || {})[shot.id] || 'auto';
          const effMode =
            curEngine === 'minimax'
              ? resolveH3VideoMode(shotMode, { lastFrame: finalImg, hasRefs: !!refsOf(shot.id), hasKeyframes: hasMultiInput(project, shot.id) })
              : curEngine === 'kling'
                ? resolveKlingMode(shotMode, { lastFrame: finalImg, model: klingModelOf(settings) })
                : resolveVideoMode(shotMode, { lastFrame: finalImg, audio: shotAud });
          return (
            <div key={shot.id} className={`shot-card s5e-card ${embed ? 's5e-compact' : ''}`}>
              {/* Card header: shot identity, timing, type and action. */}
              <div className="s5e-head s5e-cardhead">
                <strong className="s5e-title">{t('s4.shot', { n: i + 1 })}</strong>
                <span className="s5e-step" title={t('s5.durTip')}>
                  <button type="button" title={t('sb.shorter')} disabled={dur <= SHOT_MIN_SEC} onClick={() => setShotDur(shot.id, dur - SHOT_STEP_SEC)}>
                    −
                  </button>
                  <i>{dur.toFixed(1)}s</i>
                  <button type="button" title={t('sb.longer')} disabled={dur >= SHOT_MAX_SEC} onClick={() => setShotDur(shot.id, dur + SHOT_STEP_SEC)}>
                    +
                  </button>
                </span>
                {/* H3 only renders 17n+5 frame counts at 24fps and rounds up,
                    so state the length it will actually produce. */}
                {settings.videoEngine === 'minimax' && Math.abs(h3Seconds(dur) - dur) > 0.02 && (
                  <span className="s5e-snap" title={t('s5.h3SnapTip')}>
                    → {h3Seconds(dur).toFixed(2)}s
                  </span>
                )}
                {/* Multi-shot takes (H3): the user decides which 2-3
                    consecutive shots render as ONE generation with model-timed
                    internal cuts. Lead card shows the take size + ungroup;
                    members show where they render. */}
                {curEngine === 'minimax' &&
                  (() => {
                    const take = takeOf(project, shot.id);
                    if (!take) {
                      return (
                        <span className="s5e-takebtns" title={t('take.tip')}>
                          <span className="s5e-eyebrow">{t('take.label')}</span>
                          <button title={t('tip.take2')}
                            type="button"
                            className="take-btn"
                            disabled={!canCombine(project, scene.id, i, 2).ok}
                            onClick={() => combineTake(shots, i, 2)}
                          >
                            +1
                          </button>
                          <button title={t('tip.take3')}
                            type="button"
                            className="take-btn"
                            disabled={!canCombine(project, scene.id, i, 3).ok}
                            onClick={() => combineTake(shots, i, 3)}
                          >
                            +2
                          </button>
                        </span>
                      );
                    }
                    if (take.shotIds[0] === shot.id) {
                      return (
                        <span className="s5e-takebtns">
                          <span className="take-badge" title={t('take.leadTip', { n: take.shotIds.length, s: takeTotal(project, take).toFixed(1) })}>
                            {t('take.lead', { n: take.shotIds.length })}
                          </span>
                          <button title={t('tip.ungroup')} type="button" className="btn small" onClick={() => ungroupTake(shot.id)}>
                            {t('take.ungroup')}
                          </button>
                        </span>
                      );
                    }
                    const leadIdx = shots.findIndex((sh) => sh.id === take.shotIds[0]);
                    return (
                      <span className="take-badge member" title={t('take.memberTip', { n: leadIdx + 1 })}>
                        {t('take.member', { n: leadIdx + 1 })}
                      </span>
                    );
                  })()}
                {layoutEnabled(project) && (
                  <button
                    type="button"
                    className={`take-btn shot-layout ${hasLayout(project, scene.id) ? 'has-layout' : ''}`}
                    title={t('tip.spOpenShot')}
                    aria-label={t('tip.spOpenShot')}
                    onClick={() => setShowLayout({ shotId: shot.id })}
                  >
                    <Box size={14} />
                  </button>
                )}
                <StyleChip project={project} styles={styles} cat="image" onClick={onProjectSettings} />
                <StyleChip project={project} styles={styles} cat="video" onClick={onProjectSettings} />
              </div>
              <AutoTextarea
                minRows={1}
                className="s5e-action s5e-action-edit"
                value={shot.action || ''}
                placeholder={t('s5.actionPh')}
                title={t('s5.actionTip')}
                onChange={(e) => setShotAction(shot.id, e.target.value)}
              />

              {/* Generation tabs: image / video / audio in one frame. */}
              <div className="s5e-tabs" role="tablist">
                {tabList.map((tb) => (
                  <button title={t(`tip.tab_${tb}`)}
                    key={tb}
                    type="button"
                    role="tab"
                    aria-selected={tab === tb}
                    className={`s5e-tab ${tab === tb ? 'active' : ''}`}
                    onClick={() => setShotTab((v) => ({ ...v, [shot.id]: tb }))}
                  >
                    {t(`s5.tab_${tb}`)}
                    {tabHasMedia[tb] && <span className="s5e-tabdot" />}
                  </button>
                ))}
              </div>

              {/* Errors surface above the tab content so they're visible from
                  any tab (image/video/audio failures all report here). */}
              {imgErr?.id === shot.id &&
                (['NO_GEMINI_KEY', 'NO_KEY', 'COMFY_UNREACHABLE', 'NO_KLING_KEY', 'KLING_NEEDS_APP'].includes(imgErr.msg) ? (
                  <div className="note warn">
                    {t(
                      imgErr.msg === 'NO_KEY'
                        ? 'err.noKey'
                        : imgErr.msg === 'COMFY_UNREACHABLE'
                          ? 'err.comfyDown'
                          : imgErr.msg === 'NO_KLING_KEY'
                            ? 'err.noKlingKey'
                            : imgErr.msg === 'KLING_NEEDS_APP'
                              ? 'err.klingNeedsApp'
                              : 'err.noGeminiKey'
                    )}{' '}
                    <button title={t('tip.openSettings')} className="btn small" onClick={onSettings}>{t('err.openSettings')}</button>
                  </div>
                ) : (
                  <div className="note error">{imgErr.msg}</div>
                ))}

              {tab === 'image' && (
              <div className="s5e">
                {/* LEFT — prompt management */}
                <div className="s5e-panel">
                  <div className="prompt-head">
                    <label>{t('s5.img')}</label>
                    <span className="prompt-tools">
                      {modelSelect(shot, 'image')}
                      {regenBtn(shot, 'image')}
                      <CopyButton text={p.imagePrompt} />
                      {promptToggle()}
                    </span>
                  </div>
                  <AutoTextarea
                    minRows={embed ? 4 : 8}
                    className="s5e-prompt"
                    remeasure={promptOpen}
                    value={p.imagePrompt}
                    placeholder={t('s5.ph')}
                    onChange={(e) => setPrompt(shot.id, { imagePrompt: e.target.value })}
                  />
                  {tweakRow(shot, 'image')}
                  <div className="s5e-grow" />
                  <div>
                    <div className="s5e-eyebrow">{t('apply.title')}</div>
                    <div className="s5e-applyrow">
                      <SwitchPill
                        on={pref.char}
                        disabled={!shotCastRefs(project, shot).length}
                        title={
                          shotCastRefs(project, shot).length
                            ? `${t('img.useChar')} — ${shotCastRefs(project, shot).map((c) => c.name || '?').join(', ')}`
                            : t('img.useChar')
                        }
                        label={t('apply.char')}
                        extra={
                          shotCastRefs(project, shot).length ? (
                            <span className="cast-count">{shotCastRefs(project, shot).length}</span>
                          ) : null
                        }
                        onToggle={() => setPref(shot.id, { char: !pref.char })}
                      />
                      <SwitchPill
                        on={pref.loc}
                        disabled={!shotLocationRefs(project, scene, shot.id).length}
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
                      {/* Shot 1 of a scene: "palette from the previous scene"
                          (a scene flag; nothing to inherit in the first
                          scene). Later shots: this scene's first-frame
                          palette, toggleable per shot. */}
                      {isFirstShot(shot) ? (
                        prevScene && (
                          <SwitchPill
                            on={!!scene.palettePrev}
                            disabled={!prevPalette}
                            title={prevPalette ? t('scene.palettePrevTip', { n: sceneIdx }) : t('scene.palettePrevNone', { n: sceneIdx })}
                            label={t('scene.palettePrev')}
                            extra={
                              prevPalette ? (
                                <span className="pal-swatches">
                                  {prevPalette.colors.map((c) => (
                                    <i key={c} style={{ background: c }} />
                                  ))}
                                </span>
                              ) : null
                            }
                            onToggle={() => setScenePalettePrev(!scene.palettePrev)}
                          />
                        )
                      ) : (
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
                      )}
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
                            <img decoding="async" loading="lazy" src={genImg} alt="" className="zoomable" onClick={() => setLightbox({ kind: 'img', src: genImg })} />
                            <button type="button" className="s5e-dl" title={t('img.download')} onClick={() => downloadImage(shot, i)}>
                              <Download size={14} />
                            </button>
                          </div>
                          <figcaption>{t('img.first')}</figcaption>
                        </figure>
                        <figure>
                          <div className="s5e-imgwrap">
                            <img decoding="async" loading="lazy" src={finalImg} alt="" className="zoomable" onClick={() => setLightbox({ kind: 'img', src: finalImg })} />
                            {/* Embedded: the picture is hidden here, so a thumb
                                puts the final frame into the preview (click
                                again to enlarge). */}
                            {embed && (
                              <button
                                type="button"
                                className={`s5e-final-thumb ${previewFrame === 'final' ? 'cur' : ''}`}
                                title={t('img.finalPreview')}
                                aria-label={t('img.finalPreview')}
                                onClick={() => (previewFrame === 'final' ? setLightbox({ kind: 'img', src: finalImg }) : onPreviewFrame?.('final'))}
                              >
                                <img decoding="async" loading="lazy" src={finalImg} alt="" />
                              </button>
                            )}
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
                        <img decoding="async" loading="lazy" src={genImg} alt="" className="zoomable" onClick={() => setLightbox({ kind: 'img', src: genImg })} />
                        <button type="button" className="s5e-dl" title={t('img.download')} onClick={() => downloadImage(shot, i)}>
                          <Download size={14} />
                        </button>
                        {/* Version stack hovers over the preview: every version
                            incl. the current one (highlighted); ✕ removes a variant. */}
                        {renderVersions(shot, genImg, 's5e-vers-overlay')}
                      </div>
                    )
                  ) : (
                    <div className="s5-media-empty">{t('s5.noImg')}</div>
                  )}

                  {/* Versions under the frame pair (the small first frame has no room for an overlay). */}
                  {genImg && finalImg && renderVersions(shot, genImg, 's5e-vers')}

                  {/* Image tweak: sits directly beneath the image frame, full width. */}
                  <div className="voice-row refine-row">
                    <input
                      value={refineText[shot.id] || ''}
                      placeholder={t('ver.refinePh')}
                      disabled={!genImg}
                      onChange={(e) => setRefineText((v) => ({ ...v, [shot.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && refineImage(shot)}
                    />
                    <button title={t('tip.refine')}
                      className="btn small s5e-refine"
                      disabled={!genImg || imgBusy === shot.id || !(refineText[shot.id] || '').trim()}
                      onClick={() => refineImage(shot)}
                    >
                      {imgBusy === shot.id ? t('img.generating') : t('ver.refine')}
                    </button>
                  </div>

                  <div className="s5e-btnrow">
                    {/* no prompt yet: the same button writes it first */}
                    {(p.imagePrompt || '').trim() ? (
                      <button title={t('tip.genImage')}
                        className="btn small primary s5e-gen fixedw-lg"
                        disabled={anyBusy || !!regenBusy}
                        onClick={() => genImage(shot)}
                      >
                        {imgBusy === shot.id ? t('img.generating') : genImg ? t('img.regenerate') : t('img.generate')}
                      </button>
                    ) : (
                      <button title={t('tip.createPrompt')}
                        className="btn small primary s5e-gen fixedw-lg"
                        disabled={anyBusy || !!regenBusy}
                        onClick={() => regenPrompt(shot, 'image')}
                      >
                        {regenBusy === `${shot.id}:image` ? t('s5.creatingPrompt') : t('s5.createPrompt')}
                      </button>
                    )}
                    <label className="s5e-ico" title={t('img.uploadTip')} aria-label={t('img.uploadTip')}>
                      <Upload size={16} />
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
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
                      <label className="s5e-ico" title={t('img.finalUploadTip')} aria-label={t('img.finalUploadTip')}>
                        <FinalFrameUploadIcon />
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) uploadShotFinalImage(shot, f);
                          }}
                        />
                      </label>
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

                  <div className="s5e-grow" />
                  <div className="s5e-div" />
                  <div className="s5e-refgrid">
                    <div>
                      <label className="photos-label">{t('asset.shotLabel')}</label>
                      <div className="photo-row">
                        {shotAssets.map((a) => (
                          <div key={a.id} className="photo-thumb asset-thumb-sm" title={a.name}>
                            <img decoding="async" loading="lazy" src={a.photos[0]} alt="" onClick={() => setLightbox({ kind: 'img', src: a.photos[0] })} />
                            <span className="asset-tag">{a.name}</span>
                            <button title={t('tip.detachAsset')} className="photo-x" onClick={() => detachAsset(shot.id, a.id)}>✕</button>
                          </div>
                        ))}
                        <label className="photo-add" title={t('pick.upload')} aria-label={t('pick.upload')}>
                          <Upload size={20} />
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
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
                    {shotLocationsBlock(shot)}
                  </div>
                </div>
              </div>

              )}

              {/* Video tab — same split grid: prompt left, video right. */}
              {tab === 'video' && (
              <div className="s5e">
                <div className="s5e-panel">
                  <div className="prompt-head">
                    <label>{t('s5.vid', { d: dur })}</label>
                    <span className="prompt-tools">
                      {modelSelect(shot, 'video')}
                      {promptEngineBadge(shot)}
                      {regenBtn(shot, 'video')}
                      <CopyButton text={p.videoPrompt} />
                      {promptToggle()}
                    </span>
                  </div>
                  <AutoTextarea
                    minRows={embed ? 4 : 6}
                    className="s5e-prompt"
                    remeasure={promptOpen}
                    value={p.videoPrompt}
                    placeholder={t('s5.ph')}
                    onChange={(e) => setPrompt(shot.id, { videoPrompt: e.target.value })}
                  />
                  {tweakRow(shot, 'video')}
                </div>
                <div className="s5e-panel">
                  {shotVid ? (
                    // Embedded: the preview frame's transport carries expand /
                    // download, so the card shows no media strip at all.
                    !embed && (
                      <div className="s5e-imgwrap vid-wrap">
                        <video src={shotVid} controls preload="metadata" />
                        <button
                          type="button"
                          className="s5e-dl s5e-dl2"
                          title={t('vid.expand')}
                          onClick={() => setLightbox({ kind: 'vid', src: shotVid })}
                        >
                          <Expand size={14} />
                        </button>
                        <button type="button" className="s5e-dl" title={t('vid.download')} onClick={() => downloadVideo(shot, i)}>
                          <Download size={14} />
                        </button>
                      </div>
                    )
                  ) : (
                    <div className="s5-media-empty">
                      {effMode === 'r2v'
                        ? t('vid.modeR2V')
                        : !genImg
                          ? t('vid.needFrame')
                          : effMode === 'si2v'
                            ? t('vid.modeSI2V', { e: engineHintName })
                            : effMode === 'flf2v'
                              ? t('vid.modeFLF', { e: engineHintName })
                              : t('vid.modeI2V', { e: engineHintName })}
                    </div>
                  )}
                  {curEngine === 'minimax' && isTakeMember(project, shot.id) && (
                    <p className="hint take-note">
                      {t('take.renderNote', {
                        n: shots.findIndex((sh) => sh.id === takeOf(project, shot.id).shotIds[0]) + 1,
                      })}
                    </p>
                  )}
                  <div className="dyn-sliders">
                    <div className="dyn-line">
                      {dynSlider(shot, 'camera')}
                      {dynSlider(shot, 'action')}
                    </div>
                    {dynamicsStale(project, shot, sceneBlock) && (
                      <div className="dyn-stale">
                        <span className="hint">{t('dyn.stale')}</span>
                        <button title={t('tip.dynRecreate')} className="btn small" disabled={!!regenBusy || anyBusy} onClick={() => regenPrompt(shot, 'video')}>
                          {regenBusy === `${shot.id}:video` ? t('s5.creatingPrompt') : t('dyn.recreate')}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="s5e-btnrow">
                    {p.videoPrompt?.trim() ? (
                      <button title={t('tip.genVideo')}
                        className={`btn small primary s5e-gen fixedw-lg ${vidBusy ? 'progress' : ''}`}
                        disabled={
                          anyBusy ||
                          vidElsewhere ||
                          !!regenBusy ||
                          (!genImg && effMode !== 'r2v') ||
                          (curEngine === 'minimax' && isTakeMember(project, shot.id))
                        }
                        onClick={() => genVideo(shot, i)}
                      >
                        {vidBusy ? (
                          <GenProgress startedAt={vidProg.startedAt} expectedSec={vidProg.expectedSec} />
                        ) : shotVid ? (
                          t('vid.regenerate')
                        ) : (
                          t('vid.generate')
                        )}
                      </button>
                    ) : null}
                    {vidBusy && (
                      <button type="button" className="s5e-ico vid-stop" title={t('vid.stop')} aria-label={t('vid.stop')} onClick={stopVideo}>
                        <StopSq size={16} />
                      </button>
                    )}
                    {p.videoPrompt?.trim() ? null : (
                      <button title={t('tip.createPrompt')}
                        className="btn small primary s5e-gen fixedw-lg"
                        disabled={anyBusy || !!regenBusy}
                        onClick={() => regenPrompt(shot, 'video')}
                      >
                        {regenBusy === `${shot.id}:video` ? t('s5.creatingPrompt') : t('s5.createPrompt')}
                      </button>
                    )}
                    <label className="s5e-ico" title={t('vid.uploadTip')} aria-label={t('vid.uploadTip')}>
                      <Upload size={16} />
                      <input
                        type="file"
                        accept="video/*"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) uploadShotVideo(shot, f);
                        }}
                      />
                    </label>
                    {shotVid && (
                      <button
                        type="button"
                        className="s5e-ico"
                        title={t('vid.delete')}
                        aria-label={t('vid.delete')}
                        disabled={anyBusy}
                        onClick={() => deleteShotVideo(shot)}
                      >
                        <Trash size={16} />
                      </button>
                    )}
                    {/* Generation parameters share the Generate row: resolution +
                        workflow. Auto picks the richest workflow the shot's
                        material allows; a pinned choice overrides it. Options
                        whose material is missing stay disabled. */}
                    <span className="seg seg-tall seg-compact" title={t('s5.resTip')}>
                      {VIDEO_RESOLUTIONS.map((r) => (
                        <button title={t(`tip.res_${r}`)}
                          key={r}
                          type="button"
                          className={`seg-btn ${videoRes === r ? 'on' : ''}`}
                          onClick={() => update({ videoResolution: r })}
                        >
                          {r}
                        </button>
                      ))}
                    </span>
                    <span className="seg seg-tall seg-compact" title={t('vid.wfTip')}>
                      {(curEngine === 'minimax' ? H3_VIDEO_MODES : curEngine === 'kling' ? KLING_VIDEO_MODES : VIDEO_MODES).map((m) => {
                        const avail =
                          m === 'si2v' ? !!shotAud
                            : m === 'flf2v' ? !!finalImg
                            : m === 'r2v' ? !!refsOf(shot.id)
                            : m === 'mfr' ? !!genImg
                            : true;
                        return (
                          <button
                            key={m}
                            type="button"
                            className={`seg-btn ${shotMode === m ? 'on' : ''}`}
                            disabled={!avail}
                            title={avail ? t(`vid.wf_${m}`) : t(`vid.wfNeed_${m}`)}
                            onClick={() => pickMode(shot, m)}
                          >
                            {t(`vid.wfShort_${m}`)}
                          </button>
                        );
                      })}
                    </span>
                    {(genImg || effMode === 'r2v') && (
                      <span className="hint">
                        {effMode === 'mfr'
                          ? t('vid.modeMFR', {
                              n: h3MultiPlan(project, shot.id, {
                                durationSec: (() => { const tk = takeOf(project, shot.id); return tk ? takeTotal(project, tk) : Number(shot.duration || 4); })(),
                              }).guides.length,
                            })
                          : effMode === 'r2v'
                          ? t('vid.modeR2V')
                          : effMode === 'si2v'
                            ? t('vid.modeSI2V', { e: engineHintName })
                            : effMode === 'flf2v'
                              ? t('vid.modeFLF', { e: engineHintName })
                              : t('vid.modeI2V', { e: engineHintName })}
                      </span>
                    )}
                  </div>
                  {/* Reference curation (H3 only): the media the ref2va
                      checkpoint is conditioned on. Thumbnails preview the
                      set; the picker edits it. */}
                  {curEngine === 'minimax' && (
                    <div className="s5e-refrow">
                      <span className="s5e-eyebrow">{t('refs.row')}</span>
                      {(refsOf(shot.id)?.images || []).map((r, k) => (
                        <img key={`ri${k}`} className="s5e-refthumb" src={r.src} alt="" title={r.label} loading="lazy" decoding="async" />
                      ))}
                      {(refsOf(shot.id)?.videos || []).map((r, k) => (
                        <video key={`rv${k}`} className="s5e-refthumb" src={r.src} preload="metadata" muted title={r.label} />
                      ))}
                      {(refsOf(shot.id)?.audios || []).map((r, k) => (
                        <span key={`ra${k}`} className="s5e-refthumb s5e-refaud" title={r.label}>♪</span>
                      ))}
                      <button
                        type="button"
                        className="s5e-ico s5e-refbtn"
                        title={refsOf(shot.id) ? t('refs.edit') : t('refs.add')}
                        aria-label={refsOf(shot.id) ? t('refs.edit') : t('refs.add')}
                        onClick={() => setRefPickFor(shot)}
                      >
                        <Layers size={16} />
                      </button>
                    </div>
                  )}
                  {/* Keyframe anchors (H3 MULTI mode): stills pinned to exact
                      seconds of the output. Shown once the mode is picked or
                      anchors exist; the picker edits them. */}
                  {curEngine === 'minimax' && (shotMode === 'mfr' || keysOf(shot.id).length > 0) && (
                    <div className="s5e-refrow s5e-keyrow">
                      <span className="s5e-eyebrow">{t('keys.row')}</span>
                      <span className="s5e-key" title={t('keys.firstFrame')}>
                        {genImg ? <img className="s5e-refthumb" src={genImg} alt="" loading="lazy" decoding="async" /> : <span className="s5e-refthumb s5e-refaud">1</span>}
                        <i>00:00.0</i>
                      </span>
                      {keysOf(shot.id).map((k, idx) => (
                        <span className="s5e-key" key={`kf${idx}`} title={`${k.label} — ${h3Stamp(k.at)}`}>
                          {k.kind === 'image' ? (
                            <img className="s5e-refthumb" src={k.src} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <span className="s5e-refthumb s5e-refaud">♪</span>
                          )}
                          <i>{k.at.toFixed(1)}s</i>
                        </span>
                      ))}
                      <button
                        type="button"
                        className="s5e-ico s5e-refbtn"
                        title={keysOf(shot.id).length ? t('keys.edit') : t('keys.add')}
                        aria-label={keysOf(shot.id).length ? t('keys.edit') : t('keys.add')}
                        onClick={() => setKeyPickFor(shot)}
                      >
                        <Grid size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              )}

              {/* Audio tab — prompt left, voice generation right. */}
              {tab === 'audio' && (
                <div className="s5e">
                  {/* Voice generation (Gemini TTS): player, the editable
                      voice text drafted by the voice director, controls. On
                      H3, a dialogue shot can instead hand the line to the
                      model's own voice — the TTS panel then gives way to a
                      speaker block that feeds the video prompt. */}
                  <div className="s5e-panel">
                    {curEngine === 'minimax' && (shot.dialogue || '').trim() !== '' && (
                      <div className="s5e-vsrc">
                        <span className="s5e-eyebrow">{t('vsrc.label')}</span>
                        <span className="seg">
                          {['tts', 'native'].map((v) => (
                            <button title={t(`tip.vsrc_${v}`)}
                              key={v}
                              type="button"
                              className={`seg-btn ${voiceSourceOf(shot.id) === v ? 'on' : ''}`}
                              onClick={() => setVoiceSource(shot.id, v)}
                            >
                              {t(`vsrc.${v}`)}
                            </button>
                          ))}
                        </span>
                      </div>
                    )}
                    {nativeVoiceOn(shot) ? (
                      <div className="s5e-speaker">
                        <p className="hint">{t('vsrc.nativeHint')}</p>
                        <div className="prompt-head">
                          <label>{t('vsrc.speaker')}</label>
                        </div>
                        <AutoTextarea
                          minRows={3}
                          className="s5e-prompt s5e-prompt-sm"
                    remeasure={promptOpen}
                          value={(project.shotSpeakerNotes || {})[shot.id] || ''}
                          placeholder={t('vsrc.speakerPh')}
                          onChange={(e) =>
                            update((p) => ({
                              shotSpeakerNotes: { ...(p.shotSpeakerNotes || {}), [shot.id]: e.target.value },
                            }))
                          }
                        />
                        <p className="hint">{t('vsrc.regenHint')}</p>
                      </div>
                    ) : (
                      <>
                    {shotAud ? (
                      <audio className="s5e-audio" controls src={shotAud} />
                    ) : (
                      <div className="s5-media-empty s5e-audio-empty">{t('aud.none')}</div>
                    )}
                    {(p.voicePrompt || '').trim() !== '' && (
                      <>
                        <div className="prompt-head">
                          <label>{t('aud.voiceText')}</label>
                          <CopyButton text={p.voicePrompt} />
                        </div>
                        <AutoTextarea
                          minRows={3}
                          className="s5e-prompt s5e-prompt-sm"
                    remeasure={promptOpen}
                          value={p.voicePrompt}
                          onChange={(e) => setPrompt(shot.id, { voicePrompt: e.target.value })}
                        />
                      </>
                    )}

                    {/* Manual voice character and voice language. Set before
                        generating or adjust afterwards; the auto-draft never
                        overrides a manual choice. The language is auto-
                        detected from the transcript. */}
                      <div>
                        <div className="s5e-eyebrow">{t('aud.voiceDesign')}</div>
                        <div className="s5e-voicegrid">
                          <div className="s5e-vsel">
                            <label>{t('aud.vs_voice')}</label>
                            <select title={t('tip.voiceSelect')}
                              value={p.voiceParams?.geminiVoice || ''}
                              onChange={(e) =>
                                setPrompt(shot.id, {
                                  voiceParams: { ...(p.voiceParams || {}), geminiVoice: e.target.value },
                                })
                              }
                            >
                              <option value="">{t('aud.vs_autoCast')}</option>
                              {GEMINI_VOICES.map((v) => (
                                <option key={v.name} value={v.name}>
                                  {v.name} — {v.gender}, {v.style}
                                </option>
                              ))}
                            </select>
                          </div>
                          {(p.voiceParams?.speakers || []).length > 0 && (
                            <div className="s5e-vsel s5e-cast">
                              <label>{t('aud.castLabel')}</label>
                              <span className="s5e-castnames">
                                {(p.voiceParams.speakers || [])
                                  .map((s) => `${s.speaker || '—'}: ${s.voiceName}`)
                                  .join(' · ')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    {/* Timing: silence before/after the take. "Update audio"
                        rebuilds the file from the raw clip so the pads never
                        compound, and the shot grows to fit the result. */}
                    {shotAud && (
                      <div className="s5e-padrow">
                        <span className="s5e-eyebrow">{t('aud.timing')}</span>
                        <label className="s5e-pad">
                          {t('aud.padLead')}
                          <input
                            type="number"
                            min="0"
                            max="10"
                            step="0.1"
                            value={padsOf(shot.id).lead}
                            disabled={anyBusy}
                            onChange={(e) => setPads(shot.id, { lead: e.target.value })}
                          />
                          <i>s</i>
                        </label>
                        <label className="s5e-pad">
                          {t('aud.padTail')}
                          <input
                            type="number"
                            min="0"
                            max="10"
                            step="0.1"
                            value={padsOf(shot.id).tail}
                            disabled={anyBusy}
                            onChange={(e) => setPads(shot.id, { tail: e.target.value })}
                          />
                          <i>s</i>
                        </label>
                        <button title={t('tip.updateAudio')}
                          className="btn small"
                          disabled={anyBusy}
                          onClick={() => applyAudioPads(shot)}
                        >
                          {imgBusy === `${shot.id}:audp` ? t('aud.updating') : t('aud.updateAudio')}
                        </button>
                      </div>
                    )}

                    <div className="s5e-btnrow">
                      {!(p.voicePrompt || '').trim() && (shot.dialogue || '').trim() ? (
                        <button title={t('tip.createPrompt')}
                          className="btn small primary s5e-gen fixedw-lg"
                          disabled={anyBusy || recording === shot.id}
                          onClick={() => redraftVoice(shot)}
                        >
                          {imgBusy === `${shot.id}:audp` ? t('s5.creatingPrompt') : t('s5.createPrompt')}
                        </button>
                      ) : (
                        <button title={t('tip.genVoice')}
                          className="btn small primary s5e-gen fixedw-lg"
                          disabled={anyBusy || recording === shot.id || !(p.voicePrompt || '').trim()}
                          onClick={() => genVoice(shot, i)}
                        >
                          {audBusy ? t('aud.generating') : shotAud ? t('aud.regenerate') : t('aud.generate')}
                        </button>
                      )}
                      <label
                        className={`s5e-ico file-btn ${anyBusy || recording ? 'disabled' : ''}`}
                        title={t('aud.upload')}
                        aria-label={t('aud.upload')}
                      >
                        <Upload size={16} />
                        <input
                          type="file"
                          accept="audio/*"
                          className="sr-only"
                          disabled={anyBusy || !!recording}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) uploadAudio(shot, f);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="s5e-ico"
                        title={t('aud.redraft')}
                        aria-label={t('aud.redraft')}
                        disabled={anyBusy || !(shot.dialogue || '').trim()}
                        onClick={() => redraftVoice(shot)}
                      >
                        <Stars size={16} />
                      </button>
                      <button
                        type="button"
                        className={`s5e-ico ${recording === shot.id ? 'rec' : ''}`}
                        title={recording === shot.id ? t('aud.recStop') : t('aud.record')}
                        aria-label={recording === shot.id ? t('aud.recStop') : t('aud.record')}
                        disabled={anyBusy || (recording && recording !== shot.id)}
                        onClick={() => toggleRecording(shot)}
                      >
                        {recording === shot.id ? <StopSq size={16} /> : <Mic size={16} />}
                      </button>
                      {shotAud && (
                        <button
                          type="button"
                          className="s5e-ico"
                          title={t('aud.download')}
                          aria-label={t('aud.download')}
                          onClick={() => downloadAudio(shot, i)}
                        >
                          <Download size={16} />
                        </button>
                      )}
                    </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {!embed && shots.length > 0 && (
        <footer className="stage-footer">
          <button title={t('tip.continue')} className="btn primary big" onClick={goNext}>
            {t('s5.continue')}
          </button>
        </footer>
      )}

      <Lightbox item={lightbox} onClose={() => setLightbox(null)} />
      {refPickFor && (
        <RefPicker
          project={project}
          scene={scene}
          shot={refPickFor}
          refs={(project.shotRefs || {})[refPickFor.id]}
          onChange={(next) =>
            update((p) => ({ shotRefs: { ...(p.shotRefs || {}), [refPickFor.id]: next } }))
          }
          onClose={() => setRefPickFor(null)}
        />
      )}
      {keyPickFor && (
        <KeyframePicker
          project={project}
          shot={keyPickFor}
          durationSec={(() => {
            const tk = takeOf(project, keyPickFor.id);
            return tk ? takeTotal(project, tk) : Number(keyPickFor.duration || 4);
          })()}
          onChange={(next) => setKeyframes(keyPickFor.id, next)}
          onClose={() => setKeyPickFor(null)}
        />
      )}
      {showLayout && scene && (
        <SpatialModal project={project} update={update} scene={scene} settings={settings} initialShotId={showLayout.shotId || focusShotId} onClose={() => setShowLayout(null)} />
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
          onPick={(entry) => addLocation({ name: entry.name, photos: entry.photos, libId: entry.id }, pickLoc.shotId)}
          onClose={() => setPickLoc(null)}
        />
      )}
    </Root>
  );
}

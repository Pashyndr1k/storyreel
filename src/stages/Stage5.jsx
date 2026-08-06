import { useEffect, useRef, useState } from 'react';
import { useGenerate } from '../lib/useGenerate.js';
import { generateImage, generateGeminiVoice, GEMINI_VOICES } from '../lib/gemini.js';
import { generateJSON, textKeyError } from '../lib/claude.js';
import { generateComfyVideo, generateComfyImage, generateComfyVoice, saveToLocalOutputs, VIDEO_RESOLUTIONS, VIDEO_MODES, resolveVideoMode, h3Seconds, OMNI_VOICE_TAGS, OMNI_VOICE_SLOTS, OMNI_LANGUAGES, VOICE_LIBRARY } from '../lib/comfy.js';
import { stage5Prompt, stage5VideoPrompt, stage5H3VideoPrompt, h3ComposePrompt, stage5AudioPrompt, stage5VoicePrompt, stage5GeminiVoicePrompt, finalFramePrompt, tweakPromptSpec } from '../lib/prompts.js';
import { useI18n } from '../lib/i18n.js';
import { aspectDescription } from '../lib/aspect.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import { StyleChip } from '../components/StyleControls.jsx';
import DynamicsVisualizer from '../components/DynamicsVisualizer.jsx';
import SceneNav from '../components/SceneNav.jsx';
import { blockForScene, DYNAMICS_CONFIG } from '../lib/dynamics.js';
import AssetsModal from '../components/AssetsModal.jsx';
import Lightbox from '../components/Lightbox.jsx';
import { padAudioWithSilence, mediaDuration } from '../lib/audio.js';
import LibraryPicker from '../components/LibraryPicker.jsx';
import { newLibraryEntry } from '../lib/library.js';
import { fileToResizedDataURL, resizeDataURL } from '../lib/images.js';
import { extractPalette } from '../lib/palette.js';
import { Download, RestoreIcon, MapPin, Upload, Layers, Grid, Trash, Stars, Zap, Expand, Mic, StopSq } from '../components/icons.jsx';

const readFileDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });

// Split an OmniVoice design string ("female, young adult, low pitch") into
// its tag slots, and rebuild it in canonical slot order.
const parseInstruct = (instruct) => {
  const parts = String(instruct || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out = {};
  for (const slot of OMNI_VOICE_SLOTS) out[slot] = OMNI_VOICE_TAGS[slot].find((o) => parts.includes(o)) || '';
  return out;
};
const buildInstruct = (tags) => OMNI_VOICE_SLOTS.map((k) => tags[k]).filter(Boolean).join(', ');

// A Stage-4 shot's dialogue must always survive into its Stage-5 audio prompt.
// Split the dialogue into spoken lines (dropping an optional "NAME:" label) and
// compare against the model's audio prompt with case/punctuation ignored; any
// spoken line the model dropped is appended verbatim so the dialogue is never
// lost even if the LLM omits it.
const spokenLines = (dialogue) =>
  String(dialogue || '')
    .split(/\r?\n+/)
    .map((l) => l.replace(/^\s*[^:]{1,40}:\s*/, '').trim()) // strip a leading "NAME:" label
    .filter(Boolean);
const normWords = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const ensureDialogueInAudioPrompt = (audioPrompt, dialogue) => {
  const lines = spokenLines(dialogue);
  if (!lines.length) return audioPrompt;
  const haystack = normWords(audioPrompt);
  const missing = lines.filter((l) => {
    const n = normWords(l);
    return n && !haystack.includes(n);
  });
  if (!missing.length) return audioPrompt;
  const quoted = missing.map((l) => `"${l}"`).join(' ');
  return `${(audioPrompt || '').trim()}\n\nRequired dialogue (verbatim): ${quoted}`.trim();
};

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
  const [lightbox, setLightbox] = useState(null); // { kind: 'img' | 'vid', src } shown in the large pop-up
  const [tweakText, setTweakText] = useState({}); // `${shotId}:${kind}` -> adjustment draft
  const [tweakBusy, setTweakBusy] = useState(null); // `${shotId}:${kind}` in flight
  const [regenBusy, setRegenBusy] = useState(null); // `${shotId}:${kind}` single-prompt regen in flight
  const [shotTab, setShotTab] = useState({}); // shotId -> 'image' | 'video' | 'audio'

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
  // Shot voices: local OmniVoice (default) or the Gemini TTS cloud models.
  const useGeminiVoice = settings.voiceService === 'gemini';
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

  // Video prompts are written in the target model's own format (H3's
  // three-field schema vs LTX's motion-only prose), so the app remembers which
  // engine each prompt was written for and flags mismatches.
  const curEngine = settings.videoEngine === 'minimax' ? 'minimax' : 'ltx';
  const engineName = (e) => (e === 'minimax' ? 'H3' : 'LTX');

  // Each generation is up to three calls (image, video, then audio prompts for
  // scenes with dialogue), each returning only its own field — so merge into
  // the existing entry, never overwrite the other fields.
  const applyPrompts = (targetScene, data) =>
    update((p) => {
      const sceneShots = p.sceneDetails[targetScene.id]?.shots || [];
      const next = { ...p.shotPrompts };
      const engines = { ...(p.shotPromptEngines || {}) };
      (data.prompts || []).forEach((pr) => {
        const shot = sceneShots[(Number(pr.shot) || 1) - 1];
        if (!shot) return;
        const cur = next[shot.id] || {};
        // A shot's dialogue is always guaranteed into its audio prompt, even if
        // the model drops it (deterministic safety net over the prompt rule).
        const audioPrompt =
          pr.audio_prompt != null ? ensureDialogueInAudioPrompt(pr.audio_prompt, shot.dialogue) : null;
        next[shot.id] = {
          ...cur,
          imagePrompt: pr.image_prompt != null ? pr.image_prompt : cur.imagePrompt || '',
          videoPrompt: pr.video_prompt != null ? pr.video_prompt : cur.videoPrompt || '',
          ...(audioPrompt != null ? { audioPrompt } : {}),
        };
        if (pr.video_prompt != null) engines[shot.id] = curEngine;
      });
      return { shotPrompts: next, shotPromptEngines: engines };
    });

  const specFor = (s) => {
    const sceneArg = { ...s, number: project.outline.indexOf(s) + 1 };
    const sceneShots = project.sceneDetails[s.id]?.shots || [];
    const block = blockForScene(project.dynamicsPlan, sceneArg.number);
    const specs = [
      stage5Prompt(project, sceneArg, sceneShots, genLang, imageStyle),
      curEngine === 'minimax'
        ? stage5H3VideoPrompt(project, sceneArg, sceneShots, videoStyle, block)
        : stage5VideoPrompt(project, sceneArg, sceneShots, videoStyle, block),
    ];
    if (sceneShots.some((sh) => (sh.dialogue || '').trim())) {
      specs.push(stage5AudioPrompt(project, sceneArg, sceneShots, block));
    }
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
    const spec =
      curEngine === 'minimax'
        ? stage5H3VideoPrompt(project, sceneArg, sceneShots, videoStyle, block)
        : stage5VideoPrompt(project, sceneArg, sceneShots, videoStyle, block);
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
  const regenPrompt = async (shot, kind) => {
    if (regenBusy) return;
    const keyErr = textKeyError(settings);
    if (keyErr) return setImgErr({ id: shot.id, msg: keyErr });
    const cur = projectRef.current;
    const sceneArg = { ...scene, number: cur.outline.indexOf(scene) + 1 };
    const sceneShots = cur.sceneDetails[scene.id]?.shots || [];
    const block = blockForScene(cur.dynamicsPlan, sceneArg.number);
    const spec =
      kind === 'image'
        ? stage5Prompt(cur, sceneArg, sceneShots, genLang, imageStyle)
        : kind === 'video'
          ? settings.videoEngine === 'minimax'
            ? stage5H3VideoPrompt(cur, sceneArg, sceneShots, videoStyle, block)
            : stage5VideoPrompt(cur, sceneArg, sceneShots, videoStyle, block)
          : stage5AudioPrompt(cur, sceneArg, sceneShots, block);
    setRegenBusy(`${shot.id}:${kind}`);
    setImgErr(null);
    try {
      const data = await generateJSON(settings, spec);
      const idx = sceneShots.findIndex((s) => s.id === shot.id);
      const pr = (data.prompts || []).find((x) => (Number(x.shot) || 0) === idx + 1);
      const text = kind === 'image' ? pr?.image_prompt : kind === 'video' ? pr?.video_prompt : pr?.audio_prompt;
      if (typeof text !== 'string' || !text.trim()) throw new Error('The response held no prompt for this shot.');
      setPrompt(shot.id, {
        [kind === 'image' ? 'imagePrompt' : kind === 'video' ? 'videoPrompt' : 'audioPrompt']:
          kind === 'audio' ? ensureDialogueInAudioPrompt(text, shot.dialogue) : text,
      });
      if (kind === 'video') {
        update((p) => ({ shotPromptEngines: { ...(p.shotPromptEngines || {}), [shot.id]: curEngine } }));
      }
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message || String(e) });
    } finally {
      setRegenBusy(null);
    }
  };

  // Regenerate icon shown in a prompt frame's header, next to Copy.
  const regenBtn = (shot, kind) => (
    <button
      type="button"
      className={`prompt-regen ${regenBusy === `${shot.id}:${kind}` ? 'busy' : ''}`}
      title={t('s5.regenOne')}
      aria-label={t('s5.regenOne')}
      disabled={!!regenBusy}
      onClick={() => regenPrompt(shot, kind)}
    >
      <RestoreIcon size={13} />
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
        <button
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
    if (!cur) return hist;
    return hist.includes(cur) ? hist : [...[...hist].reverse(), cur];
  };

  // A newly generated image appends to the right and becomes selected (max 6
  // versions kept — the oldest drops off).
  const pushVersion = (shotId, img) =>
    update((p) => ({
      shotImages: { ...p.shotImages, [shotId]: img },
      shotImageHistory: {
        ...(p.shotImageHistory || {}),
        [shotId]: [...versionList(p, shotId), img].slice(-6),
      },
    }));

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
    if (!genImg || list.length < 2) return null;
    const curIdx = list.indexOf(genImg);
    return (
      <div className={cls}>
        <span>{t('ver.label')}</span>
        {list.map((v, vi) => {
          const isCur = vi === curIdx;
          const act = () => (isCur ? setLightbox({ kind: 'img', src: v }) : selectVersion(shot.id, v));
          return (
            <span
              key={vi}
              className={`s5e-ver ${isCur ? 'cur' : ''}`}
              role="button"
              tabIndex={0}
              title={isCur ? t('ver.current') : t('ver.restore')}
              onClick={act}
              onKeyDown={(e) => e.key === 'Enter' && act()}
            >
              <img decoding="async" loading="lazy" src={v} alt="" />
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
        .slice(0, useComfyImg ? 1 : 3);

      const ratio = project.aspectRatio || '16:9';
      let text = `${data.image_prompt}\n\nThe FIRST attached image is the shot's first frame — edit it: keep the location, environment, lighting, camera angle and framing exactly as they are, and keep every character's appearance identical.`;
      if (missingRefs.length) {
        text += ` The ${missingRefs.length === 1 ? 'next attached image is a reference photo' : `next ${missingRefs.length} attached images are reference photos`} of ${missingRefs.map((c) => c.name).join(', ')} — these characters appear in the final frame; reproduce their faces and appearance faithfully.`;
      }
      text += `\n\nRender in ${aspectDescription(ratio)} (${ratio}) aspect ratio, matching the first frame's dimensions.\n\n${FULL_FRAME_RULE}`;

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
    // Each job occupies the GPU for minutes — never start the queue silently.
    if (!window.confirm(t('s5.genMediaConfirm', { n: planned }))) return;
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

  // Generate the shot video on the local ComfyUI. Dialogue shots with a
  // generated voice go through the LTX-2 sound+image workflow (talking video
  // with the voice track baked in, rendered at the EXACT shot duration so
  // assembly never trims into synced speech); otherwise first frame + prompt
  // through image-to-video, or first + final frame through the first/last-
  // frame workflow. The result plays inline and a copy lands in the local
  // outputs folder.
  const genVideo = async (shot, i) => {
    // Read through projectRef: the prompt/frames must be the LATEST state at
    // call time (fixes regeneration using a stale video prompt after edits).
    const cur = projectRef.current;
    const first = (cur.shotImages || {})[shot.id];
    const vPrompt = (cur.shotPrompts[shot.id]?.videoPrompt || '').trim();
    if (!first || !vPrompt) return;
    // MiniMax H3 wants its native three-field schema plus a reference-frame
    // alignment header. Prompts generated for H3 are stored as JSON fields;
    // an LTX-era plain prompt is passed through so nothing breaks mid-project.
    const isH3 = settings.videoEngine === 'minimax';
    const last = (cur.shotFinalImages || {})[shot.id] || null;
    const voiceAud = (cur.shotAudios || {})[shot.id] || null;
    // A pinned workflow wins over the automatic choice (and silently falls
    // back to auto when its material is missing).
    const mode = (cur.shotVideoModes || {})[shot.id] || 'auto';
    const useMode = resolveVideoMode(mode, { lastFrame: last, audio: voiceAud });
    setImgBusy(`${shot.id}:vid`);
    setImgErr(null);
    // +3s padding rule (silent workflows only): generate longer than the
    // timeline needs; Stage 6 trims 15 frames from head and tail to mask AI
    // ramp-up and tail degradation. Voice-synced shots render at the exact
    // duration so assembly never trims into synced speech — and H3 counts as
    // voice-synced, because it generates its own dialogue, effects and score.
    const genDuration = useMode === 'si2v' || isH3
      ? Number(shot.duration || 4)
      : Math.round(shot.duration || 4) + DYNAMICS_CONFIG.generation_padding_sec;
    try {
      const sendPrompt = isH3
        ? h3ComposePrompt(vPrompt, {
            hasFirst: true,
            hasLast: useMode === 'flf2v' && !!last,
            seconds: genDuration,
          })
        : vPrompt;
      const { dataURL, filename } = await generateComfyVideo(settings, {
        prompt: sendPrompt,
        firstFrame: first,
        lastFrame: useMode === 'flf2v' ? last : null,
        audio: useMode === 'si2v' ? voiceAud : null,
        mode: useMode,
        durationSec: genDuration,
        aspectRatio: project.aspectRatio || '16:9',
        resolution: cur.videoResolution || 'HD',
        name: `${(project.title || 'project').slice(0, 24)}_sc${project.outline.indexOf(scene) + 1}_shot${i + 1}`,
      });
      saveToLocalOutputs(settings, filename, dataURL); // best-effort local copy
      update((p) => ({
        shotVideos: { ...(p.shotVideos || {}), [shot.id]: dataURL },
        videoGenDurations: {
          ...(p.videoGenDurations || {}),
          [shot.id]: isH3 ? Math.round(h3Seconds(genDuration) * 100) / 100 : genDuration,
        },
        shotVideoEngines: { ...(p.shotVideoEngines || {}), [shot.id]: isH3 ? 'minimax' : 'ltx' },
      }));
    } catch (e) {
      setImgErr({ id: shot.id, msg: e.message === 'COMFY_UNREACHABLE' ? 'COMFY_UNREACHABLE' : e.message || String(e) });
    } finally {
      setImgBusy(null);
    }
  };

  // Voice audio via the local OmniVoice TTS workflow. First run: Claude (the
  // "voice director") drafts the OmniVoice input — a voice-design instruction
  // matched to the speaking character's gender/age/personality, plus SRT
  // subtitle blocks timed to the shot's events — from the SCENE CONTEXT
  // (Action Dynamics block as the emotional fallback). The SRT is saved as an
  // editable voice prompt; later runs speak the current text.
  const draftVoicePrompt = async (shot, { keepInstruct = false } = {}) => {
    const cur = projectRef.current;
    const sceneArg = { ...scene, number: cur.outline.indexOf(scene) + 1 };
    const blockArg = blockForScene(cur.dynamicsPlan, sceneArg.number);
    const prev = cur.shotPrompts[shot.id]?.voiceParams || {};

    if (useGeminiVoice) {
      // Gemini TTS: one controllable prompt (director's notes + tagged
      // transcript) and a cast of 1-2 prebuilt voices.
      const data = await generateJSON(settings, stage5GeminiVoicePrompt(cur, sceneArg, shot, blockArg, genLang));
      const text = String(data.tts_prompt || '').trim();
      if (!text) throw new Error('The voice director returned no TTS prompt.');
      const speakers = (Array.isArray(data.speakers) ? data.speakers : [])
        .map((s) => ({ speaker: String(s.speaker || '').trim(), voiceName: String(s.voice || s.voiceName || '').trim() }))
        .filter((s) => s.voiceName)
        .slice(0, 2);
      const params = { ...prev, speakers };
      setPrompt(shot.id, { voicePrompt: text, voiceParams: params });
      return { text, ...params };
    }

    const data = await generateJSON(settings, stage5VoicePrompt(cur, sceneArg, shot, blockArg, genLang));
    const text = String(data.srt_text || '').trim();
    if (!text) throw new Error('The voice director returned no speakable text.');
    // Manually selected voice/design survive the automatic first-run draft
    // (keepInstruct); the explicit redraft button lets Claude re-cast them.
    // The language selection is the user's and is never overwritten.
    const manualInstruct = keepInstruct ? String(prev.instruct || '').trim() : '';
    const manualNarrator = keepInstruct ? String(prev.narrator || '').trim() : '';
    const params = {
      ...prev,
      instruct: manualInstruct || String(data.voice_instruct || '').trim(),
      narrator: manualNarrator || String(data.narrator_voice || '').trim(),
    };
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
    // Reuse the saved prompt only if it was drafted for the CURRENT service
    // (Gemini prompts carry a speakers cast, OmniVoice ones an instruct);
    // prompts from another engine are redrafted.
    const draftedForService = useGeminiVoice
      ? (sp.voiceParams?.speakers || []).length > 0
      : !!(sp.voiceParams?.instruct || '').trim();
    let voice = (sp.voicePrompt || '').trim() && draftedForService
      ? { text: sp.voicePrompt.trim(), ...(sp.voiceParams || {}) }
      : null;
    if (!voice) {
      const keyErr = textKeyError(settings);
      if (keyErr) return setImgErr({ id: shot.id, msg: keyErr });
    }
    if (useGeminiVoice && !settings.geminiKey) return setImgErr({ id: shot.id, msg: 'NO_GEMINI_KEY' });
    setImgBusy(`${shot.id}:aud`);
    setImgErr(null);
    try {
      if (!voice) voice = await draftVoicePrompt(shot, { keepInstruct: true });
      const name = `${(cur.title || 'project').slice(0, 24)}_sc${cur.outline.indexOf(scene) + 1}_shot${i + 1}_voice`;
      let dataURL;
      if (useGeminiVoice) {
        // A manually selected voice overrides the (dominant) first speaker.
        let speakers = (voice.speakers || []).slice(0, 2);
        if (voice.geminiVoice) {
          speakers = speakers.length
            ? [{ ...speakers[0], voiceName: voice.geminiVoice }, ...speakers.slice(1)]
            : [{ speaker: 'Narrator', voiceName: voice.geminiVoice }];
        }
        dataURL = await generateGeminiVoice(settings, { prompt: voice.text, speakers });
        saveToLocalOutputs(settings, `${name}.wav`, dataURL); // best-effort local copy
      } else {
        const res = await generateComfyVoice(settings, {
          srt: voice.text,
          instruct: voice.instruct,
          narrator: voice.narrator || '',
          lang: genLang,
          language: voice.language || '',
          name,
        });
        dataURL = res.dataURL;
        saveToLocalOutputs(settings, res.filename, dataURL); // best-effort local copy
      }
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
        <h2>{t('s5.title')}</h2>
        <div className="note warn">{t('s5.needOutline')}</div>
      </section>
    );
  }

  return (
    <section className="stage">
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

      <div className="row">
        {shots.length > 0 && (
          <button className="btn primary" disabled={busy} onClick={generate}>
            {!hasPrompts && <Stars size={14} />} {busy && !prog ? t('gen.generating') : hasPrompts ? t('s5.regenerate') : t('s5.generate', { n: shots.length })}
          </button>
        )}
        <button className="btn" disabled={busy} onClick={processAll}>{t('batch.run5')}</button>
        {staleVideoPrompts && (
          <button className="btn" disabled={busy} onClick={regenVideoPrompts} title={t('s5.updateEngineTip', { e: engineName(curEngine) })}>
            {t('s5.updateEngine', { e: engineName(curEngine) })}
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
        {shots.length > 0 && (
          <button
            type="button"
            className="icon-btn sq42 push-right"
            title={t('s5.genMedia')}
            aria-label={t('s5.genMedia')}
            disabled={busy || !!mediaProg || !!imgBusy}
            onClick={processSceneMedia}
          >
            <Zap size={18} />
          </button>
        )}
        <button
          type="button"
          className={`icon-btn sq42 ${shots.length ? '' : 'push-right'}`}
          title={t('asset.libBtn')}
          aria-label={t('asset.libBtn')}
          onClick={() => setShowAssets(true)}
        >
          <Grid size={18} />
        </button>
        <DynamicsVisualizer plan={project.dynamicsPlan} />
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
            (p.audioPrompt || '').trim() ||
            (p.voicePrompt || '').trim() ||
            shotAud
          );
          const tabList = ['image', 'video', ...(hasAudioTab ? ['audio'] : [])];
          const tab = tabList.includes(shotTab[shot.id]) ? shotTab[shot.id] : 'image';
          const tabHasMedia = { image: !!genImg, video: !!shotVid, audio: !!shotAud };
          // pinned workflow + the one that will actually run for this shot
          const shotMode = (project.shotVideoModes || {})[shot.id] || 'auto';
          const effMode = resolveVideoMode(shotMode, { lastFrame: finalImg, audio: shotAud });
          return (
            <div key={shot.id} className="shot-card s5e-card">
              {/* Card header: shot identity, timing, type and action. */}
              <div className="s5e-head s5e-cardhead">
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
                {/* H3 only renders 17n+5 frame counts at 24fps and rounds up,
                    so state the length it will actually produce. */}
                {settings.videoEngine === 'minimax' && Math.abs(h3Seconds(dur) - dur) > 0.02 && (
                  <span className="s5e-snap" title={t('s5.h3SnapTip')}>
                    → {h3Seconds(dur).toFixed(2)}s
                  </span>
                )}
                <StyleChip project={project} styles={styles} cat="image" onClick={onProjectSettings} />
                <StyleChip project={project} styles={styles} cat="video" onClick={onProjectSettings} />
              </div>
              <p className="s5e-action">{shot.action}</p>

              {/* Generation tabs: image / video / audio in one frame. */}
              <div className="s5e-tabs" role="tablist">
                {tabList.map((tb) => (
                  <button
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

              {tab === 'image' && (
              <div className="s5e">
                {/* LEFT — prompt management */}
                <div className="s5e-panel">
                  <div className="prompt-head">
                    <label>{t('s5.img')}</label>
                    <span className="prompt-tools">
                      {regenBtn(shot, 'image')}
                      <CopyButton text={p.imagePrompt} />
                    </span>
                  </div>
                  <AutoTextarea
                    minRows={8}
                    className="s5e-prompt"
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
                    <button
                      className="btn small s5e-refine"
                      disabled={!genImg || imgBusy === shot.id || !(refineText[shot.id] || '').trim()}
                      onClick={() => refineImage(shot)}
                    >
                      {imgBusy === shot.id ? t('img.generating') : t('ver.refine')}
                    </button>
                  </div>

                  <div className="s5e-btnrow">
                    <button
                      className="btn small primary s5e-gen fixedw-lg"
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
                      <label className="s5e-ico" title={t('img.finalUploadTip')} aria-label={t('img.finalUploadTip')}>
                        <FinalFrameUploadIcon />
                        <input
                          type="file"
                          accept="image/*"
                          hidden
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
                            <img decoding="async" loading="lazy" src={ph} alt="" onClick={() => setLightbox({ kind: 'img', src: ph })} />
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

              )}

              {/* Video tab — same split grid: prompt left, video right. */}
              {tab === 'video' && (
              <div className="s5e">
                <div className="s5e-panel">
                  <div className="prompt-head">
                    <label>{t('s5.vid', { d: dur })}</label>
                    <span className="prompt-tools">
                      {promptEngineBadge(shot)}
                      {regenBtn(shot, 'video')}
                      <CopyButton text={p.videoPrompt} />
                    </span>
                  </div>
                  <AutoTextarea
                    minRows={6}
                    className="s5e-prompt"
                    value={p.videoPrompt}
                    placeholder={t('s5.ph')}
                    onChange={(e) => setPrompt(shot.id, { videoPrompt: e.target.value })}
                  />
                  {tweakRow(shot, 'video')}
                </div>
                <div className="s5e-panel">
                  {shotVid ? (
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
                  ) : (
                    <div className="s5-media-empty">
                      {!genImg ? t('vid.needFrame') : shotAud ? t('vid.modeSI2V') : finalImg ? t('vid.modeFLF') : t('vid.modeI2V')}
                    </div>
                  )}
                  <div className="s5e-btnrow">
                    <button
                      className="btn small primary s5e-gen fixedw-lg"
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
                    <span className="seg seg-tall" title={t('s5.resTip')}>
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
                    {/* Workflow: Auto picks the richest one the shot's material
                        allows; a pinned choice overrides it. Options whose
                        material is missing stay disabled. */}
                    <span className="seg seg-tall" title={t('vid.wfTip')}>
                      {VIDEO_MODES.map((m) => {
                        const avail = m === 'si2v' ? !!shotAud : m === 'flf2v' ? !!finalImg : true;
                        return (
                          <button
                            key={m}
                            type="button"
                            className={`seg-btn ${shotMode === m ? 'on' : ''}`}
                            disabled={!avail}
                            title={avail ? t(`vid.wf_${m}`) : t(`vid.wfNeed_${m}`)}
                            onClick={() =>
                              update((pr) => ({
                                shotVideoModes: { ...(pr.shotVideoModes || {}), [shot.id]: m },
                              }))
                            }
                          >
                            {t(`vid.wfShort_${m}`)}
                          </button>
                        );
                      })}
                    </span>
                    {genImg && (
                      <span className="hint">
                        {effMode === 'si2v' ? t('vid.modeSI2V') : effMode === 'flf2v' ? t('vid.modeFLF') : t('vid.modeI2V')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              )}

              {/* Audio tab — prompt left, voice generation right. */}
              {tab === 'audio' && (
                <div className="s5e">
                  <div className="s5e-panel">
                    <div className="prompt-head">
                      <label>{t('s5.aud')}</label>
                      <span className="prompt-tools">
                        {regenBtn(shot, 'audio')}
                        <CopyButton text={p.audioPrompt || ''} />
                      </span>
                    </div>
                    <AutoTextarea
                      minRows={4}
                      className="s5e-prompt s5e-prompt-sm"
                      value={p.audioPrompt || ''}
                      placeholder={t('s5.audPh')}
                      onChange={(e) => setPrompt(shot.id, { audioPrompt: e.target.value })}
                    />
                  </div>

                  {/* Voice generation (Chatterbox TTS): player, the editable
                      voice text drafted by the voice director, controls. */}
                  <div className="s5e-panel">
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
                          value={p.voicePrompt}
                          onChange={(e) => setPrompt(shot.id, { voicePrompt: e.target.value })}
                        />
                      </>
                    )}

                    {/* Manual voice character and voice language. Set before
                        generating or adjust afterwards; the auto-draft never
                        overrides a manual choice. Gemini TTS shows its own
                        prebuilt-voice menu (language is auto-detected from
                        the transcript); OmniVoice shows the cloned-voice
                        library plus the design tags. */}
                    {useGeminiVoice ? (
                      <div>
                        <div className="s5e-eyebrow">{t('aud.voiceDesign')}</div>
                        <div className="s5e-voicegrid">
                          <div className="s5e-vsel">
                            <label>{t('aud.vs_voice')}</label>
                            <select
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
                    ) : (
                    <div>
                      <div className="s5e-eyebrow">{t('aud.voiceDesign')}</div>
                      <div className="s5e-voicegrid">
                        {/* Cloned voice from the real library — the most stable
                            character voice; the design tags then act as light
                            guidance. "Designed" builds the voice from tags only. */}
                        <div className="s5e-vsel">
                          <label>{t('aud.vs_voice')}</label>
                          <select
                            value={p.voiceParams?.narrator || ''}
                            onChange={(e) =>
                              setPrompt(shot.id, {
                                voiceParams: { ...(p.voiceParams || {}), narrator: e.target.value },
                              })
                            }
                          >
                            <option value="">{t('aud.vs_designed')}</option>
                            {VOICE_LIBRARY.map((v) => (
                              <option key={v.file} value={v.file}>{v.label}</option>
                            ))}
                          </select>
                        </div>
                        {OMNI_VOICE_SLOTS.map((slot) => {
                          const tags = parseInstruct(p.voiceParams?.instruct);
                          return (
                            <div className="s5e-vsel" key={slot}>
                              <label>{t(`aud.vs_${slot}`)}</label>
                              <select
                                value={tags[slot]}
                                onChange={(e) => {
                                  const next = { ...tags, [slot]: e.target.value };
                                  setPrompt(shot.id, {
                                    voiceParams: { ...(p.voiceParams || {}), instruct: buildInstruct(next) },
                                  });
                                }}
                              >
                                <option value="">—</option>
                                {OMNI_VOICE_TAGS[slot].map((v) => (
                                  <option key={v} value={v}>{v}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                        <div className="s5e-vsel">
                          <label>{t('aud.vs_lang')}</label>
                          <select
                            value={p.voiceParams?.language || ''}
                            onChange={(e) =>
                              setPrompt(shot.id, {
                                voiceParams: { ...(p.voiceParams || {}), language: e.target.value },
                              })
                            }
                          >
                            <option value="">{t('aud.vs_scriptLang')}</option>
                            {OMNI_LANGUAGES.map((l) => (
                              <option key={l} value={l}>{l === 'Auto' ? t('aud.vs_auto') : l}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                    )}
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
                        <button
                          className="btn small"
                          disabled={anyBusy}
                          onClick={() => applyAudioPads(shot)}
                        >
                          {imgBusy === `${shot.id}:audp` ? t('aud.updating') : t('aud.updateAudio')}
                        </button>
                      </div>
                    )}

                    <div className="s5e-btnrow">
                      <button
                        className="btn small primary s5e-gen fixedw-lg"
                        disabled={anyBusy || recording === shot.id || (!(shot.dialogue || '').trim() && !(p.voicePrompt || '').trim())}
                        onClick={() => genVoice(shot, i)}
                      >
                        {audBusy ? t('aud.generating') : shotAud ? t('aud.regenerate') : t('aud.generate')}
                      </button>
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
                      <label
                        className={`s5e-ico file-btn ${anyBusy || recording ? 'disabled' : ''}`}
                        title={t('aud.upload')}
                        aria-label={t('aud.upload')}
                      >
                        <Upload size={16} />
                        <input
                          type="file"
                          accept="audio/*"
                          hidden
                          disabled={anyBusy || !!recording}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) uploadAudio(shot, f);
                          }}
                        />
                      </label>
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
                  </div>
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

      <Lightbox item={lightbox} onClose={() => setLightbox(null)} />
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

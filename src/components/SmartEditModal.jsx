import { useState } from 'react';
import { generateJSON, textKeyError } from '../lib/claude.js';
import { smartEditPrompt } from '../lib/prompts.js';
import { useI18n } from '../lib/i18n.js';
import AutoTextarea from './AutoTextarea.jsx';
import VoiceButton from './VoiceButton.jsx';

// Merge the agent's sparse patch into the project. Pure; returns { patch, count }.
export function computeSmartPatch(project, data) {
  let n = 0;
  const patch = {};

  for (const f of ['title', 'logline', 'approvedPlot']) {
    if (typeof data[f] === 'string' && data[f] !== project[f]) {
      patch[f] = data[f];
      n++;
    }
  }

  const wantsSynopsis = typeof data.synopsis === 'string';
  const wantsChars = Array.isArray(data.characters) && data.characters.length;
  if (project.storyline && (wantsSynopsis || wantsChars)) {
    const characters = project.storyline.characters.map((c) => {
      const u = wantsChars ? data.characters.find((x) => x && x.id === c.id) : null;
      if (!u) return c;
      n++;
      return {
        ...c,
        ...(u.name != null && { name: u.name }),
        ...(u.role != null && { role: u.role }),
        ...(u.description != null && { description: u.description }),
      };
    });
    const storyline = { ...project.storyline, characters };
    if (wantsSynopsis && data.synopsis !== project.storyline.synopsis) {
      storyline.synopsis = data.synopsis;
      n++;
    }
    patch.storyline = storyline;
  }

  if (Array.isArray(data.scenes) && data.scenes.length) {
    patch.outline = project.outline.map((s) => {
      const u = data.scenes.find((x) => x && x.id === s.id);
      if (!u) return s;
      n++;
      return {
        ...s,
        ...(u.title != null && { title: u.title }),
        ...(u.summary != null && { summary: u.summary }),
      };
    });
  }

  if (Array.isArray(data.shots) && data.shots.length) {
    const sd = {};
    for (const key of Object.keys(project.sceneDetails)) {
      sd[key] = {
        shots: (project.sceneDetails[key]?.shots || []).map((sh) => {
          const u = data.shots.find((x) => x && x.id === sh.id);
          if (!u) return sh;
          n++;
          return {
            ...sh,
            ...(u.shotType != null && { shotType: u.shotType }),
            ...(u.location != null && { location: u.location }),
            ...(u.action != null && { action: u.action }),
            ...(u.dialogue != null && { dialogue: u.dialogue }),
            ...(u.notes != null && { notes: u.notes }),
          };
        }),
      };
    }
    patch.sceneDetails = sd;
  }

  if (Array.isArray(data.prompts) && data.prompts.length) {
    const sp = { ...project.shotPrompts };
    for (const u of data.prompts) {
      if (u && u.id && sp[u.id]) {
        sp[u.id] = {
          ...sp[u.id],
          ...(u.imagePrompt != null && { imagePrompt: u.imagePrompt }),
          ...(u.videoPrompt != null && { videoPrompt: u.videoPrompt }),
        };
        n++;
      }
    }
    patch.shotPrompts = sp;
  }

  return { patch, count: n };
}

export default function SmartEditModal({ project, update, settings, genLang, onClose, onSettings }) {
  const { t } = useI18n();
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // number of updated fields

  const apply = async () => {
    const keyErr = textKeyError(settings);
    if (keyErr) {
      setError(keyErr);
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);
    try {
      // Smart edit runs on the standard Sonnet 5 model, ungoverned by styles.
      const editSettings = { ...settings, model: 'claude-sonnet-5' };
      const data = await generateJSON(editSettings, smartEditPrompt(project, instruction.trim(), genLang));
      const { patch, count } = computeSmartPatch(project, data);
      if (count > 0) update(patch);
      setResult(count);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>{t('edit.title')}</h2>
        <p className="hint">{t('edit.desc')}</p>
        <div className="voice-row">
          <AutoTextarea
            minRows={3}
            value={instruction}
            placeholder={t('edit.ph')}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <VoiceButton
            settings={settings}
            onText={(text) => setInstruction((v) => (v ? `${v} ${text}` : text))}
            getText={() => instruction}
            onReplace={setInstruction}
          />
        </div>

        {error === 'NO_KEY' || error === 'NO_GEMINI_KEY' ? (
          <div className="note warn">
            {t(error === 'NO_GEMINI_KEY' ? 'err.noGeminiKey' : 'err.noKey')}{' '}
            <button className="btn small" onClick={onSettings}>{t('err.openSettings')}</button>
          </div>
        ) : error ? (
          <div className="note error">{t('err.failed')} {error}</div>
        ) : null}
        {result !== null && (
          <div className={`note ${result > 0 ? 'warn' : ''}`} style={result > 0 ? { color: 'var(--violet-text)', borderColor: 'rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.1)' } : {}}>
            {result > 0 ? t('edit.done', { n: result }) : t('edit.none')}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>{t('set.cancel')}</button>
          <button className="btn primary" disabled={busy || !instruction.trim()} onClick={apply}>
            {busy ? t('edit.applying') : t('edit.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

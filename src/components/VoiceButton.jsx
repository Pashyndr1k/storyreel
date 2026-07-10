import { useRef, useState } from 'react';
import { transcribeAudio } from '../lib/gemini.js';
import { useI18n } from '../lib/i18n.js';
import { Mic } from './icons.jsx';

// Push-to-talk voice input: records via MediaRecorder, transcribes via Gemini,
// then hands the text to the parent (appended to the field).
export default function VoiceButton({ settings, onText }) {
  const { t } = useI18n();
  const [rec, setRec] = useState(false);
  const [busy, setBusy] = useState(false);
  const recRef = useRef(null);
  const chunksRef = useRef([]);

  const start = async () => {
    if (!settings.geminiKey) {
      window.alert(t('err.noGeminiKey'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setBusy(true);
        try {
          const text = await transcribeAudio(settings, blob);
          if (text) onText(text);
        } catch (e) {
          window.alert(e.message === 'NO_GEMINI_KEY' ? t('err.noGeminiKey') : e.message || String(e));
        } finally {
          setBusy(false);
        }
      };
      recorder.start();
      recRef.current = recorder;
      setRec(true);
    } catch (e) {
      window.alert(e.message || String(e));
    }
  };

  const stop = () => {
    recRef.current?.stop();
    recRef.current = null;
    setRec(false);
  };

  return (
    <button
      type="button"
      className={`icon-btn voice-btn ${rec ? 'rec' : ''}`}
      title={busy ? t('voice.busy') : rec ? t('voice.stop') : t('voice.start')}
      aria-label={rec ? t('voice.stop') : t('voice.start')}
      disabled={busy}
      onClick={rec ? stop : start}
    >
      {busy ? <span className="voice-dots">…</span> : <Mic size={15} />}
    </button>
  );
}

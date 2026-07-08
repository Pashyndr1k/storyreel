import { useState } from 'react';
import { MODELS } from '../lib/claude.js';
import { LANGS, useI18n } from '../lib/i18n.js';
import { loadProjects, saveProjects } from '../lib/storage.js';
import { downloadText } from '../lib/exportScript.js';

export default function SettingsModal({ settings, setSettings, onClose }) {
  const { t } = useI18n();
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [lang, setLang] = useState(settings.lang || 'en');
  const [geminiKey, setGeminiKey] = useState(settings.geminiKey || '');
  const [geminiModel, setGeminiModel] = useState(settings.geminiModel || 'gemini-3-pro-image-preview');

  const exportAll = () => {
    downloadText('storyreel-backup.json', JSON.stringify(loadProjects(), null, 2));
  };

  const importAll = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error('bad format');
        if (window.confirm(t('set.importConfirm', { n: data.length }))) {
          saveProjects(data);
          window.location.reload();
        }
      } catch {
        window.alert(t('set.importInvalid'));
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('set.title')}</h2>
        <label>{t('set.apiKey')}</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-…"
        />
        <p className="hint">
          {t('set.apiKeyHint')}{' '}
          <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">console.anthropic.com</a>.
        </p>
        <label>{t('set.language')}</label>
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          {LANGS.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        <label>{t('set.model')}</label>
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>

        <label>{t('set.geminiKey')}</label>
        <input
          type="password"
          value={geminiKey}
          onChange={(e) => setGeminiKey(e.target.value)}
          placeholder="AIza…"
        />
        <p className="hint">
          {t('set.geminiKeyHint')}{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com</a>.
        </p>
        <label>{t('set.geminiModel')}</label>
        <input
          value={geminiModel}
          onChange={(e) => setGeminiModel(e.target.value)}
          placeholder="gemini-3-pro-image-preview"
        />

        <div className="settings-io">
          <label>{t('set.backup')}</label>
          <div className="row">
            <button className="btn small" onClick={exportAll}>{t('set.export')}</button>
            <label className="btn small file-btn">
              {t('set.import')}
              <input type="file" accept=".json,application/json" onChange={importAll} hidden />
            </label>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>{t('set.cancel')}</button>
          <button
            className="btn primary"
            onClick={() => {
              setSettings({
                ...settings,
                apiKey: apiKey.trim(),
                model,
                lang,
                geminiKey: geminiKey.trim(),
                geminiModel: geminiModel.trim() || 'gemini-3-pro-image-preview',
              });
              onClose();
            }}
          >
            {t('set.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

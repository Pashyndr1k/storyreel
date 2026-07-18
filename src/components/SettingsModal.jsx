import { useState } from 'react';
import { MODELS } from '../lib/claude.js';
import { listImageModels } from '../lib/gemini.js';
import { useI18n } from '../lib/i18n.js';
import { saveProjects, migrateProject } from '../lib/storage.js';
import { loadStyles, saveStyles, mergeStyles, buildStylesExport, parseStylesFile } from '../lib/styles.js';
import { downloadText } from '../lib/exportScript.js';
import { Archive, Key, Cpu } from './icons.jsx';

export default function SettingsModal({ settings, setSettings, projects = [], styles, setStyles, onClose }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('backups');
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [geminiKey, setGeminiKey] = useState(settings.geminiKey || '');
  const [geminiModel, setGeminiModel] = useState(settings.geminiModel || 'gemini-3-pro-image-preview');
  const [textService, setTextService] = useState(settings.textService || 'claude');
  const [storyboardService, setStoryboardService] = useState(settings.storyboardService || 'gemini');
  const [imageService, setImageService] = useState(settings.imageService || 'gemini');
  const [videoService, setVideoService] = useState(settings.videoService || 'comfy');
  const [comfyUrl, setComfyUrl] = useState(settings.comfyUrl || 'http://127.0.0.1:8000');
  const [comfyOutputDir, setComfyOutputDir] = useState(settings.comfyOutputDir || 'D:\\Claude work\\ComfyUI\\Output');
  const [projectsDir, setProjectsDir] = useState(settings.projectsDir || 'D:\\Claude work\\StoryReel Projects');
  const [modelList, setModelList] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState('');

  const fetchModels = async () => {
    setFetching(true);
    setFetchErr('');
    try {
      const list = await listImageModels({ geminiKey: geminiKey.trim() });
      setModelList(list);
    } catch (e) {
      setFetchErr(e.message === 'NO_GEMINI_KEY' ? t('err.noGeminiKey') : e.message || String(e));
    } finally {
      setFetching(false);
    }
  };

  const save = () => {
    setSettings({
      ...settings,
      apiKey: apiKey.trim(),
      model,
      geminiKey: geminiKey.trim(),
      geminiModel: geminiModel.trim() || 'gemini-3-pro-image-preview',
      textService,
      storyboardService,
      imageService,
      videoService,
      comfyUrl: comfyUrl.trim() || 'http://127.0.0.1:8000',
      comfyOutputDir: comfyOutputDir.trim() || 'D:\\Claude work\\ComfyUI\\Output',
      projectsDir: projectsDir.trim() || 'D:\\Claude work\\StoryReel Projects',
    });
    onClose();
  };

  // ---- Backups: projects (full backup) + styles (all three types) ----------
  const exportProjects = () => {
    const payload = { version: 1, exportedAt: new Date().toISOString(), projects, styles: styles || loadStyles() };
    downloadText('storyreel-backup.json', JSON.stringify(payload, null, 2));
  };
  const importProjects = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        const projs = Array.isArray(data) ? data : data.projects;
        const incomingStyles = Array.isArray(data) ? null : data.styles;
        if (!Array.isArray(projs)) throw new Error('bad format');
        if (window.confirm(t('set.importConfirm', { n: projs.length }))) {
          if (incomingStyles) saveStyles(mergeStyles(styles || loadStyles(), incomingStyles));
          await saveProjects(projs.map(migrateProject));
          window.location.reload();
        }
      } catch {
        window.alert(t('set.importInvalid'));
      }
    };
    reader.readAsText(file);
  };

  const exportStyles = () =>
    downloadText('storyreel-styles.json', JSON.stringify(buildStylesExport(styles || loadStyles()), null, 2));
  const importStyles = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = parseStylesFile(String(reader.result));
        const merged = mergeStyles(styles || loadStyles(), incoming);
        if (setStyles) setStyles(merged);
        else saveStyles(merged);
      } catch {
        window.alert(t('styles.importInvalid'));
      }
    };
    reader.readAsText(file);
  };

  const TABS = [
    ['backups', t('set.tabBackups'), Archive],
    ['api', t('set.tabApi'), Key],
    ['models', t('set.tabModels'), Cpu],
  ];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal set-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('set.title')}</h2>

        <div className="set-tabs" role="tablist">
          {TABS.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`set-tab ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="set-panel">
        {tab === 'backups' && (
          <>
            <div className="settings-io">
              <label>{t('set.backupProjects')}</label>
              <p className="hint">{t('set.backupProjectsHint')}</p>
              <div className="row">
                <button className="btn small" onClick={exportProjects}>{t('set.export')}</button>
                <label className="btn small file-btn">
                  {t('set.import')}
                  <input type="file" accept=".json,application/json" onChange={importProjects} hidden />
                </label>
              </div>
            </div>
            <div className="settings-io">
              <label>{t('set.backupStyles')}</label>
              <p className="hint">{t('set.backupStylesHint')}</p>
              <div className="row">
                <button className="btn small" onClick={exportStyles}>{t('set.export')}</button>
                <label className="btn small file-btn">
                  {t('set.import')}
                  <input type="file" accept=".json,application/json" onChange={importStyles} hidden />
                </label>
              </div>
            </div>
          </>
        )}

        {tab === 'api' && (
          <>
            <label>{t('set.apiKey')}</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-…" />
            <p className="hint">
              {t('set.apiKeyHint')}{' '}
              <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">console.anthropic.com</a>.
            </p>
            <label>{t('set.geminiKey')}</label>
            <input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIza…" />
            <p className="hint">
              {t('set.geminiKeyHint')}{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com</a>.
            </p>
            <label>{t('set.comfyUrl')}</label>
            <input value={comfyUrl} onChange={(e) => setComfyUrl(e.target.value)} placeholder="http://127.0.0.1:8000" />
            <label>{t('set.comfyOutputDir')}</label>
            <input value={comfyOutputDir} onChange={(e) => setComfyOutputDir(e.target.value)} placeholder="D:\Claude work\ComfyUI\Output" />
            <p className="hint">{t('set.comfyHint')}</p>
            <label>{t('set.projectsDir')}</label>
            <input value={projectsDir} onChange={(e) => setProjectsDir(e.target.value)} placeholder="D:\Claude work\StoryReel Projects" />
            <p className="hint">{t('set.projectsDirHint')}</p>
          </>
        )}

        {tab === 'models' && (
          <>
            <label>{t('set.model')}</label>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <label>{t('set.geminiModel')}</label>
            <input value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)} placeholder="gemini-3-pro-image-preview" />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small" disabled={fetching} onClick={fetchModels}>
                {fetching ? t('set.fetching') : t('set.fetchModels')}
              </button>
            </div>
            {fetchErr && <div className="note error">{fetchErr}</div>}
            {modelList && (modelList.length ? (
              <>
                <label className="sub-label">{t('set.modelsFound')}</label>
                <select value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)}>
                  {!modelList.includes(geminiModel) && <option value={geminiModel}>{geminiModel}</option>}
                  {modelList.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </>
            ) : (
              <div className="note warn">—</div>
            ))}

            <h3 className="settings-section">{t('set.services')}</h3>
            <label>{t('set.textService')}</label>
            <select value={textService} onChange={(e) => setTextService(e.target.value)}>
              <option value="claude">{t('set.svcClaude')}</option>
              <option value="gemini">{t('set.svcGeminiText')}</option>
            </select>
            <label>{t('set.storyboardService')}</label>
            <select value={storyboardService} onChange={(e) => setStoryboardService(e.target.value)}>
              <option value="gemini">{t('set.svcGemini')}</option>
              <option value="comfy">{t('set.svcComfySb')}</option>
            </select>
            <label>{t('set.imageService')}</label>
            <select value={imageService} onChange={(e) => setImageService(e.target.value)}>
              <option value="gemini">{t('set.svcGemini')}</option>
              <option value="comfy">{t('set.svcComfyImg')}</option>
            </select>
            <label>{t('set.videoService')}</label>
            <select value={videoService} onChange={(e) => setVideoService(e.target.value)}>
              <option value="comfy">{t('set.svcComfyVid')}</option>
            </select>
          </>
        )}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>{t('set.cancel')}</button>
          <button className="btn primary" onClick={save}>{t('set.save')}</button>
        </div>
      </div>
    </div>
  );
}

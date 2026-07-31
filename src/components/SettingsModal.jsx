import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MODELS } from '../lib/claude.js';
import { listImageModels } from '../lib/gemini.js';
import { useI18n } from '../lib/i18n.js';
import { saveProjects, migrateProject } from '../lib/storage.js';
import { loadStyles, saveStyles, mergeStyles, buildStylesExport, parseStylesFile } from '../lib/styles.js';
import { sanitizeFolder } from '../lib/projectFiles.js';
import { downloadText } from '../lib/exportScript.js';
import { Archive, Key, Cpu, Sliders } from './icons.jsx';

// UI font schemes (Interface tab). Every option keeps similar proportions so
// the hairline layout keeps its rhythm. Stacks use fonts stocked with
// Windows/macOS, except Archivo, which ships with the app (public/fonts);
// 'archivo-mix' sets Archivo for text while headings keep the default mono
// (--ui-font-display in styles.css).
const FONT_SCHEMES = [
  { id: 'default', label: 'Cascadia Code (default)', stack: "ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace" },
  { id: 'cascadia-mono', label: 'Cascadia Mono', stack: "'Cascadia Mono', 'SF Mono', Menlo, Consolas, monospace" },
  { id: 'consolas', label: 'Consolas', stack: "Consolas, Monaco, 'Andale Mono', monospace" },
  { id: 'archivo-mix', label: 'Archivo + mono headings', stack: "Archivo, 'Segoe UI', sans-serif" },
  { id: 'archivo', label: 'Archivo', stack: "Archivo, 'Segoe UI', sans-serif" },
  { id: 'lucida', label: 'Lucida Console', stack: "'Lucida Console', 'Lucida Sans Typewriter', Monaco, monospace" },
  { id: 'bahnschrift', label: 'Bahnschrift (sans)', stack: "Bahnschrift, 'Avenir Next Condensed', 'Segoe UI', sans-serif" },
];

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
  const [voiceService, setVoiceService] = useState(settings.voiceService || 'comfy');
  const [comfyUrl, setComfyUrl] = useState(settings.comfyUrl || 'http://127.0.0.1:8000');
  const [comfyOutputDir, setComfyOutputDir] = useState(settings.comfyOutputDir || 'D:\\Claude work\\ComfyUI\\Output');
  const [projectsDir, setProjectsDir] = useState(settings.projectsDir || 'D:\\Claude work\\StoryReel Projects');
  const [hideStaleToast, setHideStaleToast] = useState(!!settings.hideStaleToast);
  const [uiFont, setUiFont] = useState(settings.uiFont || 'default');

  // The selector previews its scheme live; when the modal closes, whatever is
  // actually saved in settings wins again (Save updates settings before close,
  // Cancel leaves them untouched — both paths restore correctly here).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(
    () => () => document.documentElement.setAttribute('data-font', settingsRef.current.uiFont || 'default'),
    []
  );
  const [modelList, setModelList] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState('');
  const [cleanMsg, setCleanMsg] = useState('');
  const [cleaning, setCleaning] = useState(false);

  const hasFolderIO = !!window.localFiles?.pickDirectory;
  const pickDir = async (current, setter, title) => {
    const res = await window.localFiles?.pickDirectory?.(current, title);
    if (res?.ok && res.dir) setter(res.dir);
  };

  // Folders left behind by the old rename behavior: one per keystroke of a
  // renamed title, each a full copy of the same project. Found by project id,
  // listed with their size, and only removed after an explicit confirmation.
  const cleanupStrayDirs = async () => {
    const root = projectsDir.trim() || 'D:\\Claude work\\StoryReel Projects';
    setCleaning(true);
    setCleanMsg('');
    try {
      const live = projects.map((p) => ({ id: p.id, folderName: sanitizeFolder(p.title, p.id) }));
      const res = await window.localFiles.listStrayProjectDirs(root, live);
      const dirs = res?.dirs || [];
      if (!dirs.length) {
        setCleanMsg(t('set.cleanupNone'));
        return;
      }
      const mb = dirs.reduce((n, d) => n + d.size, 0) / (1024 * 1024);
      const list = dirs
        .map((d) => `  ${d.name}  (${(d.size / (1024 * 1024)).toFixed(1)} MB)  →  ${t('set.cleanupKeeps', { name: d.keeps })}`)
        .join('\n');
      if (!window.confirm(`${t('set.cleanupConfirm', { n: dirs.length, mb: mb.toFixed(1) })}\n\n${list}`)) return;
      const del = await window.localFiles.deleteProjectDirs(root, dirs.map((d) => d.name));
      setCleanMsg(t('set.cleanupDone', { n: del?.removed ?? 0 }));
    } catch (e) {
      setCleanMsg(String(e.message || e));
    } finally {
      setCleaning(false);
    }
  };

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
      voiceService,
      comfyUrl: comfyUrl.trim() || 'http://127.0.0.1:8000',
      comfyOutputDir: comfyOutputDir.trim() || 'D:\\Claude work\\ComfyUI\\Output',
      projectsDir: projectsDir.trim() || 'D:\\Claude work\\StoryReel Projects',
      hideStaleToast,
      uiFont,
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
    ['ui', t('set.tabUI'), Sliders],
  ];

  // Auto-size the panel to the TALLEST tab so no tab ever scrolls internally.
  // All three bodies stay mounted (inactive ones positioned off-flow but
  // measurable); the panel height tracks the max of their content heights.
  const panelRef = useRef(null);
  const pageRefs = { backups: useRef(null), api: useRef(null), models: useRef(null), ui: useRef(null) };
  const [panelH, setPanelH] = useState(null);
  useLayoutEffect(() => {
    const heights = Object.values(pageRefs).map((r) => r.current?.scrollHeight || 0);
    const max = Math.max(0, ...heights);
    if (!max) return;
    const cs = panelRef.current ? getComputedStyle(panelRef.current) : null;
    const pad = cs ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) : 18;
    setPanelH(max + pad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelList, fetchErr, fetching, tab]);

  const backupsBody = (
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
      <div className="settings-io">
        <label>{t('set.projectsDir')}</label>
        <p className="hint">{t('set.projectsDirHint')}</p>
        <div className="dir-row">
          <input
            value={projectsDir}
            onChange={(e) => setProjectsDir(e.target.value)}
            placeholder="D:\Claude work\StoryReel Projects"
          />
          {hasFolderIO && (
            <>
              <button
                className="btn small"
                onClick={() => pickDir(projectsDir, setProjectsDir, t('set.projectsDir'))}
              >
                {t('set.browse')}
              </button>
              <button className="btn small" onClick={() => window.localFiles.openDirectory(projectsDir)}>
                {t('set.openFolder')}
              </button>
            </>
          )}
        </div>
        {hasFolderIO && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn small" disabled={cleaning} onClick={cleanupStrayDirs}>
              {cleaning ? t('set.cleanupBusy') : t('set.cleanupDirs')}
            </button>
            {cleanMsg && <span className="hint" style={{ margin: 0 }}>{cleanMsg}</span>}
          </div>
        )}
      </div>
    </>
  );

  const apiBody = (
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
            <div className="dir-row">
              <input value={comfyOutputDir} onChange={(e) => setComfyOutputDir(e.target.value)} placeholder="D:\Claude work\ComfyUI\Output" />
              {hasFolderIO && (
                <button
                  className="btn small"
                  onClick={() => pickDir(comfyOutputDir, setComfyOutputDir, t('set.comfyOutputDir'))}
                >
                  {t('set.browse')}
                </button>
              )}
            </div>
            <p className="hint">{t('set.comfyHint')}</p>
    </>
  );

  const modelsBody = (
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
      <label>{t('set.voiceService')}</label>
      <select value={voiceService} onChange={(e) => setVoiceService(e.target.value)}>
        <option value="comfy">{t('set.svcOmniVoice')}</option>
        <option value="gemini">{t('set.svcGeminiTts')}</option>
      </select>
    </>
  );

  const uiBody = (
    <>
      <label>{t('set.uiFont')}</label>
      <p className="hint">{t('set.uiFontHint')}</p>
      <select
        value={uiFont}
        onChange={(e) => {
          setUiFont(e.target.value);
          // preview instantly; Cancel restores the saved scheme on close
          document.documentElement.setAttribute('data-font', e.target.value);
        }}
      >
        {FONT_SCHEMES.map((f) => (
          <option key={f.id} value={f.id} style={{ fontFamily: f.stack }}>
            {f.label}
          </option>
        ))}
      </select>

      <label>{t('set.staleToast')}</label>
      <p className="hint">{t('set.staleToastHint')}</p>
      <label className="check-row">
        <input
          type="checkbox"
          checked={!hideStaleToast}
          onChange={(e) => setHideStaleToast(!e.target.checked)}
        />
        <span>{t('set.staleToastShow')}</span>
      </label>
    </>
  );

  const bodies = { backups: backupsBody, api: apiBody, models: modelsBody, ui: uiBody };

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

        {/* All three bodies stay mounted for measurement; the panel is sized to
            the tallest so no tab scrolls. Inactive bodies sit off-flow. */}
        <div className="set-panel" ref={panelRef} style={panelH ? { height: `${panelH}px` } : undefined}>
          {TABS.map(([id]) => (
            <div key={id} ref={pageRefs[id]} className={`set-page ${tab === id ? 'on' : 'off'}`}>
              {bodies[id]}
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>{t('set.cancel')}</button>
          <button className="btn primary" onClick={save}>{t('set.save')}</button>
        </div>
      </div>
    </div>
  );
}

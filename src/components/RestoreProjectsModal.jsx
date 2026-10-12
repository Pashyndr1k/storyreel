import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { listRestorableFolders, restoreProjectFromFolder } from '../lib/projectFiles.js';
import { uid } from '../lib/storage.js';

// Bring projects back from the per-project folders on disk (the app's own
// mirror: project.md + media files). Folders whose project is already in the
// app are listed but unticked; folders without an id come back as new
// projects. Nothing on disk is changed.
export default function RestoreProjectsModal({ root, projects, onRestore, onClose }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState(null); // null = scanning
  const [checked, setChecked] = useState(() => new Set());
  const [busy, setBusy] = useState(null); // { n, m, title }
  const [log, setLog] = useState([]);
  const have = new Set(projects.map((p) => p.id));

  useEffect(() => {
    let alive = true;
    listRestorableFolders(root).then((dirs) => {
      if (!alive) return;
      // newest first; an older folder of the same project (a pre-rename copy)
      // is an "older copy" and stays unticked
      const list = dirs.filter((d) => d.hasPayload).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      const seenIds = new Set();
      for (const d of list) {
        d.stale = !!d.id && seenIds.has(d.id);
        if (d.id) seenIds.add(d.id);
      }
      setRows(list);
      setChecked(new Set(list.filter((d) => !d.stale && !(d.id && have.has(d.id))).map((d) => d.folder)));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const toggle = (folder) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(folder)) n.delete(folder);
      else n.add(folder);
      return n;
    });
  const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString(lang === 'en' ? 'en-GB' : lang) : '');
  const fmtSize = (b) => (b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

  const run = async () => {
    const todo = (rows || []).filter((d) => checked.has(d.folder));
    if (!todo.length || busy) return;
    const done = [];
    const seen = new Set(have);
    for (let i = 0; i < todo.length; i++) {
      const d = todo[i];
      setBusy({ n: i + 1, m: todo.length, title: d.title });
      try {
        const p = await restoreProjectFromFolder(root, d.folder);
        if (!p.id || seen.has(p.id)) p.id = uid(); // a folder without an id, or one already restored
        seen.add(p.id);
        onRestore([p], d);
        done.push(p);
        setLog((l) => [...l, { ok: true, title: p.title }]);
      } catch (e) {
        setLog((l) => [...l, { ok: false, title: d.title, error: e?.message || String(e) }]);
      }
    }
    setBusy(null);
    setRows((rs) => (rs || []).map((r) => (done.some((p) => p.title === r.title && checked.has(r.folder)) ? { ...r, restored: true } : r)));
    setChecked(new Set());
  };

  const all = (rows || []).map((d) => d.folder);
  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal rst-modal" onClick={(e) => e.stopPropagation()}>
        <h2 title={t('tip.restoreProjects')}>{t('rst.title')}</h2>
        <p className="hint">{t('rst.hint', { dir: root })}</p>
        {rows === null ? (
          <p className="hint">…</p>
        ) : rows.length === 0 ? (
          <p className="hint">{t('rst.empty')}</p>
        ) : (
          <>
            <div className="row rst-tools">
              <button type="button" className="btn small" title={t('tip.rstAll')} disabled={!!busy} onClick={() => setChecked(new Set(all))}>{t('rst.selectAll')}</button>
              <button type="button" className="btn small" title={t('tip.rstNone')} disabled={!!busy} onClick={() => setChecked(new Set())}>{t('rst.selectNone')}</button>
            </div>
            <div className="rst-list">
              {rows.map((d) => {
                const inApp = (d.id && have.has(d.id)) || d.restored;
                return (
                  <label key={d.folder} className={`check-row rst-row ${inApp ? 'rst-inapp' : ''}`} title={t('tip.rstRow')}>
                    <input type="checkbox" checked={checked.has(d.folder)} disabled={!!busy} onChange={() => toggle(d.folder)} />
                    <span className="rst-title">{d.title}</span>
                    <span className="rst-meta">
                      {inApp ? `${t('rst.inApp')} · ` : d.stale ? `${t('rst.stale')} · ` : !d.id ? `${t('rst.noId')} · ` : ''}
                      {t('rst.scenes', { n: d.scenes })} · {fmtSize(d.bytes)} · {t('rst.saved', { d: fmtDate(d.savedAt) })}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
        {busy && <p className="hint">{t('rst.busy', { n: busy.n, m: busy.m, title: busy.title })}</p>}
        {log.length > 0 && !busy && (
          <ul className="rst-log">
            {log.map((e, i) => (
              <li key={i} className={e.ok ? '' : 'over'}>{e.ok ? t('rst.ok', { title: e.title }) : t('rst.failed', { title: e.title, error: e.error })}</li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" title={t('tip.rstClose')} disabled={!!busy} onClick={onClose}>{t('rst.close')}</button>
          <button type="button" className="btn primary" title={t('tip.rstRestore')} disabled={!!busy || !checked.size} onClick={run}>{t('rst.restore')}</button>
        </div>
      </div>
    </div>
  );
}

import { useI18n } from '../lib/i18n.js';

// Shared bits for showing/choosing the project's styles outside the project
// settings modal. Both write/read the same project fields the modal edits
// (scriptStyleId / imageStyleId / videoStyleId), so they stay in sync with it.
const ID_FIELD = { script: 'scriptStyleId', image: 'imageStyleId', video: 'videoStyleId' };

function styleNameOf(styles, cat, id, t) {
  if (!id) return t('pset.styleNone');
  const s = (styles?.[cat] || []).find((x) => x.id === id);
  return s?.name || t('pset.styleNone');
}

// Compact style selectors (Stage 2, next to the cover) — one select per
// category, mirroring the project settings.
export function StylePicker({ project, update, styles }) {
  const { t } = useI18n();
  return (
    <div className="style-picks">
      {['script', 'image', 'video'].map((cat) => (
        <div className="style-pick" key={cat}>
          <label>{t(`stind.${cat}`)}</label>
          <select
            value={project[ID_FIELD[cat]] || ''}
            onChange={(e) => update({ [ID_FIELD[cat]]: e.target.value })}
          >
            <option value="">{t('pset.styleNone')}</option>
            {(styles?.[cat] || []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

// Read-only chips showing the currently selected style(s); clicking opens the
// project settings so the choice can be changed in place.
export function StyleIndicator({ project, styles, cats, onClick }) {
  const { t } = useI18n();
  return (
    <div className="style-ind-row">
      {cats.map((cat) => (
        <button key={cat} type="button" className="style-ind" title={t('stind.open')} onClick={onClick}>
          <span className="style-ind-cat">{t(`stind.${cat}`)}:</span>
          <span className="style-ind-name">{styleNameOf(styles, cat, project[ID_FIELD[cat]], t)}</span>
        </button>
      ))}
    </div>
  );
}

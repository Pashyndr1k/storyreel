import { useI18n } from '../lib/i18n.js';
import { sortLibrary } from '../lib/library.js';

// Modal for picking a character/location from the global library
// (used by the Stage 2 / Stage 4 photo-upload flows).
export default function LibraryPicker({ kind, library, onPick, onClose }) {
  const { t } = useI18n();
  const entries = sortLibrary(
    (library || []).filter((e) => e.kind === kind && e.photos.length),
    'date'
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>{t(`pick.title_${kind}`)}</h2>
        {entries.length === 0 ? (
          <p className="hint">{t('lib.empty')}</p>
        ) : (
          <div className="lib-pick-grid">
            {entries.map((e) => (
              <button
                key={e.id}
                type="button"
                className="lib-pick-card"
                onClick={() => {
                  onPick(e);
                  onClose();
                }}
              >
                <img src={e.photos[0]} alt="" />
                <strong>{e.name || t('lib.unnamed')}</strong>
                {kind !== 'asset' && <span>{t(`type.${e.type}`)}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>{t('set.cancel')}</button>
        </div>
      </div>
    </div>
  );
}

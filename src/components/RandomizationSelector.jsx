import { RANDOMIZATION_METHODS, toggleMethod, MAX_METHODS } from '../lib/randomization.js';
import { useI18n } from '../lib/i18n.js';
import { Dice } from './icons.jsx';

// Stage-1 plot randomization picker: one row of toggle chips, max 2 active.
// Selecting a 3rd drops the oldest active method (handled by toggleMethod).
// The full name and explanation live in the chip's hover hint.
export default function RandomizationSelector({ value = [], onChange }) {
  const { t } = useI18n();
  const active = Array.isArray(value) ? value : [];

  return (
    <div className="tool-group" role="group" aria-label={t('rand.title')}>
      <span className="tool-group-label" title={t('rand.title')}>
        <Dice size={13} />
        {t('rand.short')}
        <span className="tool-count">{active.length}/{MAX_METHODS}</span>
      </span>
      {RANDOMIZATION_METHODS.map((id) => {
        const on = active.includes(id);
        return (
          <button
            key={id}
            type="button"
            className={`tool-chip ${on ? 'on' : ''}`}
            aria-pressed={on}
            title={`${t(`rand.name_${id}`)} — ${t(`rand.tip_${id}`)}`}
            onClick={() => onChange(toggleMethod(active, id))}
          >
            {t(`rand.short_${id}`)}
          </button>
        );
      })}
    </div>
  );
}

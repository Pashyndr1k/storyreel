import { RANDOMIZATION_METHODS, toggleMethod, MAX_METHODS } from '../lib/randomization.js';
import { useI18n } from '../lib/i18n.js';
import { Dice } from './icons.jsx';

// Stage-1 plot randomization picker: a grid of toggle cards, max 2 active.
// Selecting a 3rd drops the oldest active method (handled by toggleMethod).
export default function RandomizationSelector({ value = [], onChange }) {
  const { t } = useI18n();
  const active = Array.isArray(value) ? value : [];

  return (
    <div className="rand-block">
      <div className="rand-head">
        <Dice size={15} />
        <span>{t('rand.title')}</span>
        <span className="rand-count">{active.length}/{MAX_METHODS}</span>
      </div>
      <div className="rand-grid">
        {RANDOMIZATION_METHODS.map((id) => {
          const on = active.includes(id);
          return (
            <button
              key={id}
              type="button"
              className={`rand-card ${on ? 'on' : ''}`}
              aria-pressed={on}
              title={t(`rand.tip_${id}`)}
              onClick={() => onChange(toggleMethod(active, id))}
            >
              <span className="rand-check">{on ? '✓' : ''}</span>
              <strong>{t(`rand.name_${id}`)}</strong>
              <span className="rand-tip">{t(`rand.tip_${id}`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

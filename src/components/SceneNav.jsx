import { useI18n } from '../lib/i18n.js';
import { Check } from './icons.jsx';

// Scene navigation for stages 4 and 5 — same rectangular-segment family as the
// stage bar, but calmer: wraps into rows for long outlines, and the selected
// scene uses a soft violet fill instead of the stage bar's saturated gradient.
export default function SceneNav({ outline, currentId, isDone, onSelect }) {
  const { t } = useI18n();
  return (
    <nav className="scn-bar">
      {outline.map((s, i) => {
        const sel = s.id === currentId;
        const done = isDone(s);
        return (
          <button
            key={s.id}
            type="button"
            className={`scn ${sel ? 'sel' : ''} ${done ? 'done' : ''}`}
            onClick={() => onSelect(s.id)}
          >
            <span className="scn-num">{i + 1}</span>
            <span className="scn-title">{s.title || t('s4.untitled')}</span>
            {done && !sel && <Check size={13} className="scn-check" />}
          </button>
        );
      })}
    </nav>
  );
}

import { Moon, HalfCircle, Sun } from './icons.jsx';
import { useI18n } from '../lib/i18n.js';

// Three-state color-scheme button: each click cycles dark → medium → light →
// dark and swaps the icon. Lives in the top bar next to the language selector.
const ORDER = ['dark', 'medium', 'light'];
const ICON = { dark: Moon, medium: HalfCircle, light: Sun };

export default function ThemeToggle({ theme, setTheme }) {
  const { t } = useI18n();
  const cur = ORDER.includes(theme) ? theme : 'dark';
  const Icon = ICON[cur];
  const next = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
  const label = `${t('set.theme')}: ${t(`theme.${cur}`)}`;
  return (
    <button
      type="button"
      className="icon-btn h44 theme-toggle"
      title={label}
      aria-label={label}
      onClick={() => setTheme(next)}
    >
      <Icon size={18} />
    </button>
  );
}

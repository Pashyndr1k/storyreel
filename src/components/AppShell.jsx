import Dropdown from './Dropdown.jsx';
import { Clapperboard, Grid, Layers, Settings, Globe, Search } from './icons.jsx';
import { LANGS, useI18n } from '../lib/i18n.js';

// Persistent violet app frame with the left icon rail and the top bar.
// `search` (optional) => { value, onChange, placeholder } renders the centered search field.
export default function AppShell({
  route,
  onNavigate,
  onSettings,
  lang,
  setLang,
  search,
  children,
}) {
  const { t } = useI18n();

  const railItem = (key, icon, active, onClick, label) => (
    <button
      type="button"
      className={`rail-ico ${active ? 'active' : ''}`}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {icon}
    </button>
  );

  const langOptions = LANGS.map((l) => ({
    value: l.id,
    label: { en: 'EN', ru: 'RU', uk: 'UA' }[l.id] || l.id.toUpperCase(),
  }));

  return (
    <div className="app-page">
      <div className="app-glow" />
      <div className="app-frame">
        <aside className="rail">
          <div className="rail-logo" aria-hidden="true">
            <Clapperboard size={20} />
          </div>
          {railItem('home', <Grid size={20} />, route === 'home', () => onNavigate('home'), t('nav.projects'))}
          {railItem('archive', <Layers size={20} />, route === 'archive', () => onNavigate('archive'), t('nav.archive'))}
          <div className="rail-spacer" />
          {railItem('settings', <Settings size={20} />, false, onSettings, t('nav.settings'))}
        </aside>

        <div className="app-main">
          <div className="topbar">
            <div className="brand">
              <div className="brand-name">StoryReel</div>
              <div className="brand-tagline">v{__APP_VERSION__}</div>
            </div>

            {search ? (
              <div className="topbar-search">
                <Search size={17} className="topbar-search-ico" />
                <input
                  value={search.value}
                  onChange={(e) => search.onChange(e.target.value)}
                  placeholder={search.placeholder}
                  aria-label={search.placeholder}
                />
              </div>
            ) : (
              <div className="topbar-search-spacer" />
            )}

            <div className="topbar-right">
              <Dropdown
                pill
                value={lang || 'en'}
                options={langOptions}
                onChange={setLang}
                icon={<Globe size={15} />}
                title={t('set.language')}
              />
              <div className="avatar" aria-hidden="true">SR</div>
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

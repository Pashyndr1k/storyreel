import Dropdown from './Dropdown.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import Logo from './Logo.jsx';
import { Grid, Box, Cog, Globe, User, MapPin, Palette } from './icons.jsx';
import { LANGS, useI18n } from '../lib/i18n.js';

// Editorial app frame (design 5a): a hairline header bar with the ink logo
// tile, app name + version, horizontal nav icons and the right-side controls.
// Pages render their own title rows (with search where they need it).
export default function AppShell({
  route,
  onNavigate,
  onSettings,
  lang,
  setLang,
  theme,
  setTheme,
  children,
}) {
  const { t } = useI18n();

  const navItem = (key, icon, label) => (
    <button
      type="button"
      className={`hd-ico ${route === key ? 'active' : ''}`}
      title={label}
      aria-label={label}
      aria-current={route === key ? 'page' : undefined}
      onClick={() => onNavigate(key)}
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
      <header className="hd">
        <div className="hd-inner">
          <button className="hd-logo" aria-label="StoryReel" onClick={() => onNavigate('home')}>
            <Logo size={26} />
          </button>
          <div className="hd-brand">
            <span className="hd-name">StoryReel</span>
            <span className="hd-ver">v{__APP_VERSION__}</span>
          </div>
          <nav className="hd-nav">
            {navItem('home', <Grid size={19} />, t('nav.projects'))}
            {navItem('archive', <Box size={19} />, t('nav.archive'))}
            {navItem('characters', <User size={19} />, t('nav.characters'))}
            {navItem('locations', <MapPin size={19} />, t('nav.locations'))}
            {navItem('styles', <Palette size={19} />, t('nav.styles'))}
          </nav>
          <div className="hd-right">
            <Dropdown
              pill
              value={lang || 'en'}
              options={langOptions}
              onChange={setLang}
              icon={<Globe size={15} />}
              title={t('set.language')}
            />
            {setTheme && <ThemeToggle theme={theme} setTheme={setTheme} />}
            <button
              type="button"
              className="icon-btn"
              title={t('set.title')}
              aria-label={t('set.title')}
              onClick={onSettings}
            >
              <Cog size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">{children}</main>
    </div>
  );
}

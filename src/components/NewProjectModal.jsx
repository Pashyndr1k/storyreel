import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import AutoTextarea from './AutoTextarea.jsx';
import VoiceButton from './VoiceButton.jsx';
import AspectSelector from './AspectSelector.jsx';
import { SERIES_MIN_EPISODES, SERIES_MAX_EPISODES, SERIES_DEFAULT_EPISODES, EPISODE_DEFAULT_SEC, EPISODE_SEC_CHOICES, clampEpisodes } from '../lib/series.js';

// 'series' is the short-drama template: a vertical serial planned by episodes — first in the list
const TYPES = ['series', 'short', 'medium', 'long'];

export default function NewProjectModal({ onCreate, onClose, settings }) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [logline, setLogline] = useState('');
  const [type, setType] = useState('medium');
  const [aspect, setAspect] = useState('16:9');
  const [episodes, setEpisodes] = useState(String(SERIES_DEFAULT_EPISODES));
  const [epSec, setEpSec] = useState(EPISODE_DEFAULT_SEC); // 60 / 90 / 120 s per episode
  // the series template is vertical; leaving it restores the usual default
  const pickType = (k) => {
    if (k === 'series' && type !== 'series') setAspect('9:16');
    if (k !== 'series' && type === 'series') setAspect('16:9');
    setType(k);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 title={t('tip.newTitle')}>{t('new.title')}</h2>
        <label>{t('new.titleLabel')}</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('new.titlePlaceholder')}
          autoFocus
        />
        <label>{t('new.type')}</label>
        <div className="type-cards">
          {TYPES.map((k) => (
            <button title={t(`new.typeHint_${k}`)}
              key={k}
              type="button"
              className={`type-card ${type === k ? 'selected' : ''}`}
              onClick={() => pickType(k)}
            >
              <strong>{t(`new.type_${k}`)}</strong>
              <span>{t(`new.typeHint_${k}`)}</span>
            </button>
          ))}
        </div>
        {type === 'series' && (
          <>
            <label htmlFor="new-episodes">{t('new.episodes')}</label>
            <p className="hint">{t('new.episodesHint')}</p>
            <div className="row new-episodes-row">
              <input
                id="new-episodes"
                type="number"
                className="episodes-input"
                title={t('tip.episodes')}
                min={SERIES_MIN_EPISODES}
                max={SERIES_MAX_EPISODES}
                value={episodes}
                onChange={(e) => setEpisodes(e.target.value)}
                onBlur={() => setEpisodes(String(clampEpisodes(episodes)))}
              />
              {/* episode length: the three lengths of the format */}
              <span className="seg seg-compact" role="radiogroup" aria-label={t('new.epSeconds')} title={t('new.epSecondsTip')}>
                {EPISODE_SEC_CHOICES.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={epSec === s} className={`seg-btn ${epSec === s ? 'on' : ''}`} title={t('new.epSecondsOpt', { s })} onClick={() => setEpSec(s)}>
                    {s} {t('unit.sec')}
                  </button>
                ))}
              </span>
            </div>
          </>
        )}
        <label>{t('new.aspect')}</label>
        <AspectSelector value={aspect} onChange={setAspect} />

        <label>{t('new.plotLabel')}</label>
        <div className="voice-row">
          <AutoTextarea
            minRows={5}
            value={logline}
            onChange={(e) => setLogline(e.target.value)}
            placeholder={t(type === 'series' ? 'new.plotPlaceholderSeries' : 'new.plotPlaceholder')}
          />
          <VoiceButton
            settings={settings}
            onText={(text) => setLogline((v) => (v ? `${v} ${text}` : text))}
            getText={() => logline}
            onReplace={setLogline}
          />
        </div>
        <div className="modal-actions">
          <button title={t('tip.cancel')} className="btn" onClick={onClose}>{t('new.cancel')}</button>
          <button title={t('tip.create')}
            className="btn primary"
            disabled={!logline.trim()}
            onClick={() => onCreate(title, logline.trim(), type, aspect, type === 'series' ? clampEpisodes(episodes) : 0, type === 'series' ? epSec : 0)}
          >
            {t('new.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

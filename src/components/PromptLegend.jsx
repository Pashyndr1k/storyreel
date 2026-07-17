import { useI18n } from '../lib/i18n.js';
import { HIGHLIGHT_CATS } from '../lib/promptHighlight.js';

// Small key explaining the prompt-structure colors used in the prompt fields.
export default function PromptLegend() {
  const { t } = useI18n();
  return (
    <div className="prompt-legend" title={t('ph.legendTip')}>
      <span className="pl-title">{t('ph.legend')}</span>
      {HIGHLIGHT_CATS.map((c) => (
        <span key={c} className="pl-item">
          <i className={`pl-dot ph-${c}`} />
          {t(`ph.${c}`)}
        </span>
      ))}
    </div>
  );
}

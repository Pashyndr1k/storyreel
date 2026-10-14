import { useI18n } from '../lib/i18n.js';
import { ORIGINALITY_KEYS, normalizeOriginality, DICE_SLOTS, DICE_MAX, rollDiceWord, normalizeDice, PLOT_WHERE, plotBlockOf, rollPlotBlock, normalizeStructureDie, normalizeInterview } from '../lib/originality.js';
import { Stars } from './icons.jsx';

// Stage-1 "unconventional plot" options: a row of toggle chips (all off by
// default) — OriginalitySelector — and, below the row, the panels of the
// three that carry data (the story dice, the structure die, the story
// interview) — OriginalityPanels. The full name and explanation live in each
// chip's hover hint.
export default function OriginalitySelector({ project, update }) {
  const { t } = useI18n();
  const flags = normalizeOriginality(project.originality);
  // functional: two quick toggles must not overwrite each other
  const toggle = (k) =>
    update((p) => {
      const cur = normalizeOriginality(p.originality);
      return { originality: { ...cur, [k]: !cur[k] } };
    });
  return (
    <div className="tool-group" role="group" aria-label={t('orig.title')}>
      <span className="tool-group-label" title={t('orig.hint')}>
        <Stars size={13} />
        {t('orig.short')}
      </span>
      {ORIGINALITY_KEYS.map((k) => (
        <button key={k} type="button" className={`tool-chip ${flags[k] ? 'on' : ''}`} aria-pressed={flags[k]} title={`${t(`orig.name_${k}`)} — ${t(`orig.tip_${k}`)}`} onClick={() => toggle(k)}>
          {t(`orig.short_${k}`)}
        </button>
      ))}
    </div>
  );
}

export function OriginalityPanels({ project, update, onInterview, busy = false }) {
  const { t } = useI18n();
  const flags = normalizeOriginality(project.originality);
  const dice = normalizeDice(project.storyDice);
  const die = normalizeStructureDie(project.structureDie);
  const block = die ? plotBlockOf(die.id) : null;
  const interview = normalizeInterview(project.interview);
  if (!flags.dice && !flags.structure && !flags.interview) return null;

  const setDice = (list) => update({ storyDice: normalizeDice(list) });
  const setDie = (next) => update({ structureDie: normalizeStructureDie(next) });
  const setAnswer = (i, answer) => update({ interview: { questions: interview.questions.map((q, j) => (j === i ? { ...q, answer } : q)) } });

  return (
    <div className="orig-panels">
      {flags.dice && (
        <div className="orig-panel" title={t('orig.diceTip')}>
          <div className="orig-panel-head">
            <strong>{t('orig.diceTitle')}</strong>
            <span className="hint">{t('orig.diceHint')}</span>
          </div>
          {dice.map((d, i) => (
            <div key={i} className="row dice-row">
              <input
                className="dice-word"
                value={d.word}
                placeholder={t('orig.diceWordPh')}
                title={t('orig.diceWordTip')}
                onChange={(e) => setDice(dice.map((x, j) => (j === i ? { ...x, word: e.target.value } : x)))}
              />
              <span className="seg seg-compact" role="radiogroup" aria-label={t('orig.diceAt')} title={t('orig.diceAt')}>
                {DICE_SLOTS.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={d.at === s} className={`seg-btn ${d.at === s ? 'on' : ''}`} title={t(`orig.slotTip_${s}`)} onClick={() => setDice(dice.map((x, j) => (j === i ? { ...x, at: s } : x)))}>
                    {t(`orig.slot_${s}`)}
                  </button>
                ))}
              </span>
              <button type="button" className="btn tiny" title={t('orig.rerollTip')} onClick={() => setDice(dice.map((x, j) => (j === i ? { ...x, word: rollDiceWord(dice.map((y) => y.word)) } : x)))}>🎲</button>
              <button type="button" className="btn tiny" title={t('orig.diceRemoveTip')} aria-label={t('orig.diceRemoveTip')} onClick={() => setDice(dice.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <div className="row">
            <button type="button" className="btn small" disabled={dice.length >= DICE_MAX} title={t('orig.diceRollTip')} onClick={() => setDice([...dice, { word: rollDiceWord(dice.map((y) => y.word)), at: DICE_SLOTS[dice.length % DICE_SLOTS.length] }])}>
              {t('orig.diceRoll')}
            </button>
            <button type="button" className="btn small" disabled={dice.length >= DICE_MAX} title={t('orig.diceAddTip')} onClick={() => setDice([...dice, { word: '', at: 'middle' }])}>
              {t('orig.diceAdd')}
            </button>
            {dice.length > 0 && (
              <button type="button" className="btn small" title={t('orig.diceClearTip')} onClick={() => setDice([])}>{t('orig.diceClear')}</button>
            )}
          </div>
        </div>
      )}

      {flags.structure && (
        <div className="orig-panel" title={t('orig.structureTip')}>
          <div className="orig-panel-head">
            <strong>{t('orig.structureTitle')}</strong>
            <span className="hint">{t('orig.structureHint')}</span>
          </div>
          {block ? (
            <div className="plot-block">
              <span className="sr-tag muted" title={t('orig.kindTip')}>{t(`orig.kind_${block.kind}`)}</span>
              <strong>{block.name}</strong>
              <p>{block.summary}</p>
              <p className="hint">{t('orig.elements')} {block.elements}</p>
            </div>
          ) : (
            <p className="hint">{t('orig.structureNone')}</p>
          )}
          <div className="row">
            <button type="button" className="btn small" title={t('orig.structureRollTip')} onClick={() => setDie({ id: rollPlotBlock(die?.id).id, where: die?.where || 'act2' })}>
              {block ? t('orig.structureReroll') : t('orig.structureRoll')}
            </button>
            {block && (
              <>
                <span className="seg seg-compact" role="radiogroup" aria-label={t('orig.where')} title={t('orig.where')}>
                  {PLOT_WHERE.map((w) => (
                    <button key={w} type="button" role="radio" aria-checked={die.where === w} className={`seg-btn ${die.where === w ? 'on' : ''}`} title={t(`orig.whereTip_${w}`)} onClick={() => setDie({ ...die, where: w })}>
                      {t(`orig.where_${w}`)}
                    </button>
                  ))}
                </span>
                <button type="button" className="btn small" title={t('orig.structureClearTip')} onClick={() => setDie(null)}>{t('orig.structureClear')}</button>
              </>
            )}
          </div>
        </div>
      )}

      {flags.interview && (
        <div className="orig-panel" title={t('orig.interviewTip')}>
          <div className="orig-panel-head">
            <strong>{t('orig.interviewTitle')}</strong>
            <span className="hint">{t('orig.interviewHint')}</span>
          </div>
          {interview.questions.map((q, i) => (
            <div key={i} className="interview-q">
              <p className="interview-question">
                <strong>{i + 1}.</strong> {q.question}
                {q.why && <span className="hint"> — {q.why}</span>}
              </p>
              {q.options.length > 0 && (
                <div className="row interview-options">
                  {q.options.map((o, k) => (
                    <button key={k} type="button" className={`btn tiny ${q.answer === o ? 'primary' : ''}`} title={t('orig.optionTip')} onClick={() => setAnswer(i, q.answer === o ? '' : o)}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
              <input className="interview-answer" value={q.answer} placeholder={t('orig.answerPh')} title={t('orig.answerTip')} onChange={(e) => setAnswer(i, e.target.value)} />
            </div>
          ))}
          <div className="row">
            <button type="button" className="btn small primary" disabled={busy || !(project.logline || '').trim()} title={t('orig.askTip')} onClick={onInterview}>
              {busy ? t('gen.generating') : interview.questions.length ? t('orig.askAgain') : t('orig.ask')}
            </button>
            {interview.questions.length > 0 && (
              <button type="button" className="btn small" title={t('orig.interviewClearTip')} onClick={() => update({ interview: { questions: [] } })}>{t('orig.interviewClear')}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

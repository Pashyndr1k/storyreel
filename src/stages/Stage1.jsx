import { useGenerate } from '../lib/useGenerate.js';
import { stage1Prompt } from '../lib/prompts.js';
import { uid } from '../lib/storage.js';
import { useI18n } from '../lib/i18n.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import VoiceButton from '../components/VoiceButton.jsx';
import RandomizationSelector from '../components/RandomizationSelector.jsx';
import { Stars, Star, Trash, Chevron } from '../components/icons.jsx';
import { useState } from 'react';

export default function Stage1({ project, update, settings, goNext, onSettings, genLang, scriptStyle }) {
  const { t } = useI18n();
  const { busy, error, run } = useGenerate(settings);

  const generate = () => {
    const spec = stage1Prompt(project, genLang, scriptStyle, project.randomization);
    run(spec, (data) =>
      update({
        // Stamp each idea with the concrete random modifiers that shaped this
        // generation (e.g. which constraint / persona / micro-tone was rolled).
        ideas: (data.ideas || []).map((i) => ({ id: uid(), ...i, modifiers: spec.applied || [] })),
        selectedIdeaId: null,
      })
    );
  };

  const pickIdea = (idea) =>
    update((p) => ({
      selectedIdeaId: idea.id,
      approvedPlot: idea.pitch,
      title: p.title === 'Untitled project' && idea.title ? idea.title : p.title,
    }));

  // Pinned directions: a saved list that survives regenerations. A pin is a
  // copy of the idea (or of the approved plot as it reads now), so it can be
  // returned to after any number of new variations.
  const pinned = project.pinnedIdeas || [];
  const [openPins, setOpenPins] = useState(() => new Set()); // unfolded pinned rows (ids)
  const togglePinOpen = (id) =>
    setOpenPins((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const isPinned = (idea) => pinned.some((p) => p.id === idea.id);
  const togglePin = (idea) =>
    update((p) => {
      const list = p.pinnedIdeas || [];
      return {
        pinnedIdeas: list.some((x) => x.id === idea.id)
          ? list.filter((x) => x.id !== idea.id)
          : [...list, { id: idea.id, title: idea.title || '', pitch: idea.pitch || '', why_it_works: idea.why_it_works || '', modifiers: idea.modifiers || [], pinnedAt: Date.now() }],
      };
    });
  const approved = (project.approvedPlot || '').trim();
  const approvedPinned = !!approved && pinned.some((p) => (p.pitch || '').trim() === approved);
  const pinApproved = () =>
    update((p) => ({
      pinnedIdeas: [
        ...(p.pinnedIdeas || []),
        { id: uid(), title: t('s1.pinnedPlotTitle', { n: (p.pinnedIdeas || []).length + 1 }), pitch: (p.approvedPlot || '').trim(), why_it_works: '', modifiers: [], pinnedAt: Date.now() },
      ],
    }));

  const ideaMods = (idea) =>
    (idea.modifiers || []).length > 0 && (
      <p className="idea-mods">
        🎲{' '}
        {idea.modifiers
          .map((m) => (m.name ? `${t(`rand.name_${m.method}`)}: ${m.name}` : t(`rand.name_${m.method}`)))
          .join(' · ')}
      </p>
    );

  const ideaCard = (idea) => (
    <div key={idea.id} className={`idea-card ${project.selectedIdeaId === idea.id ? 'selected' : ''}`}>
      <div className="idea-head">
        <h3 title={idea.title}>{idea.title}</h3>
        <button
          type="button"
          className={`idea-pin ${isPinned(idea) ? 'on' : ''}`}
          aria-pressed={isPinned(idea)}
          title={isPinned(idea) ? t('tip.s1Unpin') : t('tip.s1Pin')}
          aria-label={isPinned(idea) ? t('tip.s1Unpin') : t('tip.s1Pin')}
          onClick={() => togglePin(idea)}
        >
          <Star size={16} filled={isPinned(idea)} />
        </button>
      </div>
      <p>{idea.pitch}</p>
      {idea.why_it_works && <p className="why"><em>{idea.why_it_works}</em></p>}
      {ideaMods(idea)}
      <button title={t('tip.s1Pick')} className="btn small primary" onClick={() => pickIdea(idea)}>
        {project.selectedIdeaId === idea.id ? t('s1.selected') : t('s1.develop')}
      </button>
    </div>
  );

  return (
    <section className="stage">
      <h2 className="stage-h2" data-tip={t('s1.desc')}>{t('s1.title')}</h2>

      <label>{t('s1.loglineLabel')}</label>
      <div className="voice-row">
        <AutoTextarea
          minRows={4}
          value={project.logline}
          onChange={(e) => update({ logline: e.target.value })}
          placeholder={t('s1.loglinePlaceholder')}
        />
        <VoiceButton
          settings={settings}
          onText={(text) => update({ logline: project.logline ? `${project.logline} ${text}` : text })}
          getText={() => project.logline}
          onReplace={(text) => update({ logline: text })}
        />
      </div>

      <RandomizationSelector
        value={project.randomization}
        onChange={(next) => update({ randomization: next })}
      />

      <div className="row">
        <button title={t('tip.s1Generate')} className="btn primary" disabled={busy || !project.logline.trim()} onClick={generate}>
          {!project.ideas.length && <Stars size={14} />} {busy ? t('gen.generating') : project.ideas.length ? t('s1.regenerate') : t('s1.generate')}
        </button>
      </div>
      <ErrorNote error={error} onSettings={onSettings} />

      {project.ideas.length > 0 && <div className="ideas-grid">{project.ideas.map((idea) => ideaCard(idea))}</div>}

      {pinned.length > 0 && (
        <>
          <h3 className="pinned-title" title={t('s1.pinnedHint')}>
            <Star size={14} filled /> {t('s1.pinnedTitle')} <span className="chip-count" title={t('ind.count')}>{pinned.length}</span>
          </h3>
          <p className="hint">{t('s1.pinnedHint')}</p>
          {/* compact: one row per pinned version — the title; the row unfolds
              into the full description */}
          <div className="pinned-list">
            {pinned.map((idea) => {
              const isOpen = openPins.has(idea.id);
              const sel = project.selectedIdeaId === idea.id;
              return (
                <div key={idea.id} className={`pinned-row ${sel ? 'selected' : ''} ${isOpen ? 'open' : ''}`}>
                  <div className="pinned-head">
                    <button
                      type="button"
                      className="pinned-toggle"
                      aria-expanded={isOpen}
                      title={isOpen ? t('tip.s1PinFold') : t('tip.s1PinUnfold')}
                      onClick={() => togglePinOpen(idea.id)}
                    >
                      <span className={`prompt-fold ${isOpen ? 'open' : ''}`} aria-hidden="true"><Chevron size={14} /></span>
                      <span className="pinned-name">{idea.title || t('s1.pinnedUntitled')}</span>
                    </button>
                    <button title={t('tip.s1Pick')} className="btn small primary fixedw" onClick={() => pickIdea(idea)}>
                      {sel ? t('s1.selected') : t('s1.developShort')}
                    </button>
                    <button type="button" className="idea-pin" title={t('tip.s1Unpin')} aria-label={t('tip.s1Unpin')} onClick={() => togglePin(idea)}>
                      <Trash size={15} />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="pinned-body">
                      <p>{idea.pitch}</p>
                      {idea.why_it_works && <p className="why"><em>{idea.why_it_works}</em></p>}
                      {ideaMods(idea)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <label>{t('s1.approvedLabel')}</label>
      <div className="voice-row">
        <AutoTextarea
          minRows={5}
          value={project.approvedPlot}
          onChange={(e) => update({ approvedPlot: e.target.value, selectedIdeaId: null })}
          placeholder={t('s1.approvedPlaceholder')}
        />
        <VoiceButton
          settings={settings}
          onText={(text) =>
            update({ approvedPlot: project.approvedPlot ? `${project.approvedPlot} ${text}` : text, selectedIdeaId: null })
          }
          getText={() => project.approvedPlot}
          onReplace={(text) => update({ approvedPlot: text, selectedIdeaId: null })}
        />
      </div>
      <div className="row">
        <button title={t('tip.s1Original')}
          className="btn small"
          onClick={() => update({ approvedPlot: project.logline, selectedIdeaId: null })}
        >
          {t('s1.useOriginal')}
        </button>
        <button title={approvedPinned ? t('tip.s1PlotPinned') : t('tip.s1PinPlot')} className="btn small" disabled={!approved || approvedPinned} onClick={pinApproved}>
          <Star size={13} filled={approvedPinned} /> {approvedPinned ? t('s1.plotPinned') : t('s1.pinPlot')}
        </button>
      </div>

      <footer className="stage-footer">
        <button title={t('tip.continue')} className="btn primary big" disabled={!project.approvedPlot.trim()} onClick={goNext}>
          {t('s1.continue')}
        </button>
      </footer>
    </section>
  );
}

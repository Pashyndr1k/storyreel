import { useGenerate } from '../lib/useGenerate.js';
import { stage1Prompt } from '../lib/prompts.js';
import { uid } from '../lib/storage.js';
import { useI18n } from '../lib/i18n.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import VoiceButton from '../components/VoiceButton.jsx';
import RandomizationSelector from '../components/RandomizationSelector.jsx';

export default function Stage1({ project, update, settings, goNext, onSettings, genLang, scriptStyle }) {
  const { t } = useI18n();
  const { busy, error, run } = useGenerate(settings);

  const generate = () =>
    run(stage1Prompt(project, genLang, scriptStyle, project.randomization), (data) =>
      update({
        ideas: (data.ideas || []).map((i) => ({ id: uid(), ...i })),
        selectedIdeaId: null,
      })
    );

  const pickIdea = (idea) =>
    update((p) => ({
      selectedIdeaId: idea.id,
      approvedPlot: idea.pitch,
      title: p.title === 'Untitled project' && idea.title ? idea.title : p.title,
    }));

  return (
    <section className="stage">
      <h2>{t('s1.title')}</h2>
      <p className="stage-desc">{t('s1.desc')}</p>

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
        />
      </div>

      <RandomizationSelector
        value={project.randomization}
        onChange={(next) => update({ randomization: next })}
      />

      <div className="row">
        <button className="btn primary" disabled={busy || !project.logline.trim()} onClick={generate}>
          {busy ? t('gen.generating') : project.ideas.length ? t('s1.regenerate') : t('s1.generate')}
        </button>
      </div>
      <ErrorNote error={error} onSettings={onSettings} />

      {project.ideas.length > 0 && (
        <div className="ideas-grid">
          {project.ideas.map((idea) => (
            <div key={idea.id} className={`idea-card ${project.selectedIdeaId === idea.id ? 'selected' : ''}`}>
              <h3>{idea.title}</h3>
              <p>{idea.pitch}</p>
              <p className="why"><em>{idea.why_it_works}</em></p>
              <button className="btn small primary" onClick={() => pickIdea(idea)}>
                {project.selectedIdeaId === idea.id ? t('s1.selected') : t('s1.develop')}
              </button>
            </div>
          ))}
        </div>
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
        />
      </div>
      <div className="row">
        <button
          className="btn small"
          onClick={() => update({ approvedPlot: project.logline, selectedIdeaId: null })}
        >
          {t('s1.useOriginal')}
        </button>
      </div>

      <footer className="stage-footer">
        <button className="btn primary big" disabled={!project.approvedPlot.trim()} onClick={goNext}>
          {t('s1.continue')}
        </button>
      </footer>
    </section>
  );
}

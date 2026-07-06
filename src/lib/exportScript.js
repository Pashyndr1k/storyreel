import { createT } from './i18n.js';

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function buildScriptMarkdown(project, lang = 'en') {
  const t = createT(lang);
  const L = [];
  L.push(`# ${project.title}`);
  if (project.genres.length) L.push(`**${t('exp.genres')}:** ${project.genres.join(', ')}`);
  L.push(`**${t('exp.created')}:** ${new Date(project.createdAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')}`);
  L.push('');

  if (project.logline) {
    L.push(`## ${t('exp.originalIdea')}`, '', project.logline, '');
  }
  if (project.approvedPlot) {
    L.push(`## ${t('exp.approvedPlot')}`, '', project.approvedPlot, '');
  }
  if (project.storyline?.synopsis) {
    L.push(`## ${t('exp.synopsis')}`, '', project.storyline.synopsis, '');
  }
  if (project.storyline?.characters?.length) {
    L.push(`## ${t('exp.characters')}`, '');
    for (const c of project.storyline.characters) {
      L.push(`- **${c.name}** (${c.role}) — ${c.description}`);
    }
    L.push('');
  }

  if (project.outline.length) {
    L.push(`## ${t('exp.script')}`, '');
    let absStart = 0;
    project.outline.forEach((scene, i) => {
      const shots = project.sceneDetails[scene.id]?.shots || [];
      const sceneDur = shots.length
        ? shots.reduce((a, s) => a + (s.duration || 0), 0)
        : scene.duration || 0;
      L.push(`### ${t('exp.scene')} ${i + 1}: ${scene.title} (${fmt(absStart)}–${fmt(absStart + sceneDur)})`, '');
      L.push(scene.summary, '');
      let tc = absStart;
      shots.forEach((shot, j) => {
        L.push(`#### ${t('exp.shot')} ${j + 1} · ${fmt(tc)}–${fmt(tc + (shot.duration || 0))} · ${shot.shotType || ''} (${shot.duration}s)`, '');
        L.push(`- **${t('exp.location')}:** ${shot.location || '—'}`);
        L.push(`- **${t('exp.action')}:** ${shot.action || '—'}`);
        if (shot.dialogue) L.push(`- **${t('exp.dialogue')}:** ${shot.dialogue}`);
        if (shot.notes) L.push(`- **${t('exp.notes')}:** ${shot.notes}`);
        const p = project.shotPrompts[shot.id];
        if (p?.imagePrompt) L.push('', `**${t('exp.imagePrompt')}:**`, '', '```', p.imagePrompt, '```');
        if (p?.videoPrompt) L.push('', `**${t('exp.videoPrompt')}:**`, '', '```', p.videoPrompt, '```');
        L.push('');
        tc += shot.duration || 0;
      });
      absStart += sceneDur;
    });
  }

  return L.join('\n');
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

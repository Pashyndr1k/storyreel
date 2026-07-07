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

function b64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function b64DecodeUtf8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// The exported .md is human-readable AND re-importable: the full project JSON
// travels inside an invisible HTML comment at the end of the file.
export function buildProjectExport(project, lang = 'en') {
  return (
    buildScriptMarkdown(project, lang) +
    `\n\n<!-- storyreel-project:${b64EncodeUtf8(JSON.stringify(project))} -->\n`
  );
}

export function parseProjectFile(text) {
  const m = text.match(/<!--\s*storyreel-project:([A-Za-z0-9+/=]+)\s*-->/);
  if (m) {
    try {
      const p = JSON.parse(b64DecodeUtf8(m[1]));
      if (p && p.id && 'stage' in p) return p;
    } catch {
      /* fall through */
    }
  }
  try {
    const p = JSON.parse(text);
    if (p && !Array.isArray(p) && p.id && 'stage' in p) return p;
  } catch {
    /* not JSON */
  }
  return null;
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

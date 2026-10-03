// Script export (Stage 4 / Project settings), available once every scene has
// its shot breakdown:
//   book — the synopsis, then the story as plain narrative prose: only what
//          happens and what is said, with shot types, locations, timings and
//          technical notes left out;
//   json — the marked-up script: everything Stage 4 holds, for other tools.
import { createT } from './i18n.js';

export const scriptReady = (project) =>
  (project.outline || []).length > 0 && project.outline.every((s) => project.sceneDetails?.[s.id]?.shots?.length);

// Production cues that sometimes sit inside an action line: "[camera pans]",
// "(SFX: door slam)", "Camera: slow push-in.", "Sound: rain."
const CUE_WORDS = 'sfx|fx|vfx|sound|audio|music|score|camera|cam|shot|angle|zoom|pan|tilt|dolly|close-up|closeup|cut to|fade|transition|vo|v\\.o\\.|o\\.s\\.';
const BRACKET_CUE = new RegExp(`\\s*[\\[(](?:${CUE_WORDS})\\b[^\\])]*[\\])]`, 'gi');
const LABEL_CUE = new RegExp(`(?:^|(?<=[.!?…]\\s))(?:${CUE_WORDS})\\s*:[^.!?…]*[.!?…]?\\s*`, 'gi');

function narrative(text) {
  return String(text || '')
    .replace(BRACKET_CUE, '')
    .replace(LABEL_CUE, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

export function buildBookText(project, lang = 'en') {
  const t = createT(lang);
  const L = [`# ${project.title}`, ''];
  const synopsis = (project.storyline?.synopsis || '').trim();
  if (synopsis) L.push(`## ${t('exp.synopsis')}`, '', synopsis, '', '* * *', '');
  project.outline.forEach((scene, i) => {
    L.push(`## ${scene.title || `${t('exp.scene')} ${i + 1}`}`, '');
    for (const shot of project.sceneDetails[scene.id]?.shots || []) {
      const action = narrative(shot.action);
      if (action) L.push(action, '');
      // spoken lines stay as written, one paragraph per line of dialogue
      for (const line of String(shot.dialogue || '').split('\n').map((x) => x.trim()).filter(Boolean)) L.push(line, '');
    }
  });
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function buildScriptJSON(project, lang = 'en') {
  const chars = project.storyline?.characters || [];
  let at = 0;
  const scenes = project.outline.map((scene, i) => {
    const shots = project.sceneDetails[scene.id]?.shots || [];
    let tc = at;
    const outShots = shots.map((s, j) => {
      const row = {
        number: j + 1,
        start_sec: tc,
        duration_sec: Number(s.duration) || 0,
        shot_type: s.shotType || '',
        location: s.location || '',
        action: s.action || '',
        dialogue: s.dialogue || '',
        notes: s.notes || '',
      };
      tc += row.duration_sec;
      return row;
    });
    const row = {
      number: i + 1,
      ...(scene.episode ? { episode: scene.episode } : {}),
      title: scene.title || '',
      summary: scene.summary || '',
      start_sec: at,
      duration_sec: tc - at,
      planned_duration_sec: Number(scene.duration) || 0,
      shots: outShots,
    };
    at = tc;
    return row;
  });
  return {
    format: 'storyreel-script',
    version: 1,
    exported_at: new Date().toISOString(),
    title: project.title,
    genres: project.genres || [],
    language: project.lang || lang,
    aspect_ratio: project.aspectRatio,
    script_type: project.scriptType,
    ...(project.seriesPart
      ? { series: { title: project.seriesPart.seriesTitle, episodes_total: project.seriesPart.total, episode_from: project.seriesPart.from, episode_to: project.seriesPart.to } }
      : {}),
    synopsis: project.storyline?.synopsis || '',
    characters: chars.map((c) => ({ name: c.name || '', role: c.role || '', description: c.description || '' })),
    groups: (project.storyline?.groups || []).map((g) => ({
      name: g.name || '',
      description: g.description || '',
      members: (g.memberIds || []).map((id) => chars.find((c) => c.id === id)?.name).filter(Boolean),
    })),
    total_duration_sec: at,
    scenes,
    dynamics_plan: project.dynamicsPlan || null,
  };
}

export const scriptFileBase = (project) => (project.title || 'script').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'script';

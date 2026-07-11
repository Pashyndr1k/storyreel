// Plot Randomization Engine (Stage 1). Composes extra system-prompt directives
// and an LLM temperature from up to two selected methods, using two static JSON
// asset libraries imported once (in-memory, not read per request).
//
// NOTE ON ARCHITECTURE: the feature spec describes a TS server route with a
// `promptBuilder.ts`. StoryReel is a local-first Electron/React app with no
// backend server, so the "backend composition logic" lives here in the lib layer
// and feeds stage1Prompt() + the Claude client. Behaviour matches the spec.
import obliqueConstraints from '../data/oblique_constraints.json';
import microTones from '../data/micro_tones.json';
import auteurPersonas from '../data/auteur_personas.json';

/** @typedef {{id:string,name:string,category:string,prompt_injection:string}} ObliqueConstraint */
/** @typedef {{id:string,name:string,vibe:string}} MicroTone */
/** @typedef {{id:string,name:string,persona_instruction:string}} AuteurPersona */

/** @type {ObliqueConstraint[]} */
const CONSTRAINTS = Array.isArray(obliqueConstraints) ? obliqueConstraints : [];
/** @type {MicroTone[]} */
const TONES = Array.isArray(microTones) ? microTones : [];
/** @type {AuteurPersona[]} */
const PERSONAS = Array.isArray(auteurPersonas) ? auteurPersonas : [];

export const MAX_METHODS = 2;

// The four selectable methods (order defines the card grid). Labels/tips are
// looked up by id in i18n; the injection text below is English-only (it's sent
// to the model, and Stage-1 output language is governed elsewhere).
export const RANDOMIZATION_METHODS = ['oblique_strategies', 'auteur_persona', 'genre_mashup', 'forced_variance'];

// Spec method 4 ends with "Format as 4 distinct Markdown headings." Stage 1 must
// return strict JSON, so that final formatting clause is adapted to map the four
// frameworks onto the four JSON ideas instead (the rest is verbatim).
const FORCED_VARIANCE_INJECTION =
  'STRUCTURAL RULE: Every pitch must follow a completely different narrative framework: Pitch 1 must be a Character-Driven Subversion (focus on a contradictory flaw). Pitch 2 must be a Contextual Shift (unexpected setting or era). Pitch 3 must be a Mechanical/Surreal Twist (altering physical reality). Pitch 4 must be a Misdirection (setting up a cliché, then pulling the rug out). Apply these four frameworks to ideas 1, 2, 3 and 4 respectively in the JSON output.';

/** Secure-enough random element. Returns undefined for an empty array. */
export function getRandomElement(array) {
  if (!Array.isArray(array) || array.length === 0) return undefined;
  return array[Math.floor(Math.random() * array.length)];
}

// Enforce the "max 2, drop the oldest" rule. `active` is the current ordered
// list; toggling an id off removes it, toggling on appends and trims the front.
export function toggleMethod(active, id) {
  const list = Array.isArray(active) ? active : [];
  if (list.includes(id)) return list.filter((m) => m !== id);
  const next = [...list, id];
  return next.length > MAX_METHODS ? next.slice(next.length - MAX_METHODS) : next;
}

export function sanitizeMethods(active) {
  const list = (Array.isArray(active) ? active : []).filter((m) => RANDOMIZATION_METHODS.includes(m));
  const deduped = [...new Set(list)];
  return deduped.slice(0, MAX_METHODS);
}

// Build the system-prompt append for the selected methods. Fallback safety: if
// an asset library is empty, that method is skipped instead of crashing
// generation. (No temperature tuning — that parameter is deprecated for Sonnet.)
export function buildRandomization(methods) {
  const selected = sanitizeMethods(methods);
  const parts = [];
  // The concrete random picks made for this generation — surfaced in the UI so
  // each generated idea can note which modifiers shaped it.
  const applied = [];

  for (const id of selected) {
    if (id === 'oblique_strategies') {
      const c = getRandomElement(CONSTRAINTS);
      if (c?.prompt_injection) {
        parts.push(
          `CRITICAL CONSTRAINT: To avoid clichés, you must strictly integrate this random constraint into the narrative logic: [${c.prompt_injection}]. It must act as the primary structural friction driving the plot, not just a background detail.`
        );
        applied.push({ method: id, name: c.name || '' });
      }
    } else if (id === 'auteur_persona') {
      const persona = getRandomElement(PERSONAS);
      if (persona?.persona_instruction) {
        parts.push(
          `DIRECTORIAL LENS RULE: You must abandon your default helpful AI persona. You are now acting as a highly opinionated Auteur director with the following philosophy: [${persona.persona_instruction}]. You must aggressively filter the user's idea through this specific psychological and artistic lens. Force the narrative to conform to these specific biases.`
        );
        applied.push({ method: id, name: persona.name || '' });
      }
    } else if (id === 'genre_mashup') {
      const tone = getRandomElement(TONES);
      if (tone?.vibe) {
        parts.push(
          `GENRE MASHUP RULE: You must write these pitches through the atmospheric and narrative lens of this secondary micro-tone: [${tone.vibe}]. Blend the user's original idea with the tropes of this micro-tone.`
        );
        applied.push({ method: id, name: tone.name || '' });
      }
    } else if (id === 'forced_variance') {
      parts.push(FORCED_VARIANCE_INJECTION);
      applied.push({ method: id, name: '' });
    }
  }

  // Whether a method already supplies a strong directorial persona (so the
  // Stage-1 default persona should step aside).
  const overridesPersona = selected.includes('auteur_persona');
  return { systemAppend: parts.length ? '\n\n' + parts.join('\n\n') : '', overridesPersona, applied };
}

// Factory sub-genre briefs of the short-drama engine (style library category
// "drama"). Each colours the tone, world and plot types of a vertical short
// drama; none of them touches the format's mechanics (opening, turns, hooks,
// dialogue, frame), which lib/shortDrama/rules.js imposes on every series.
export const DRAMA_STYLES = [
  {
    id: 'bi8.drama.comedy',
    name: 'Comedy',
    instructions: 'Sub-genre: COMEDY. The pressure is social and the stakes are embarrassment, exposure and escalating lies told to keep a small deception alive. Openings: an absurd rule taken completely seriously, or a lie that must now be lived. Each turn raises the cost of keeping up the pretence; the same trigger gets a different in-character reaction from every character. Villains are petty and certain. Hooks are revelations of what the lie has grown into, or a rupture played straight. Lines are short, literal and deadpan; the comedy is in the mismatch between the calm words and the panic in the hands. No winking at the camera, no jokes that stop the conflict.',
  },
  {
    id: 'bi8.drama.dark_comedy',
    name: 'Dark comedy',
    instructions: 'Sub-genre: DARK COMEDY. Crime, death, money and family treated with a straight face and terrible logic. The lead solves one problem by creating a worse one; every win is a trap. Openings: a body, a debt or a confession in the wrong place at the wrong time. Turns are escalating practical complications. Villains are reasonable people with monstrous priorities. Hooks reveal who else knows, or what the lead has just become. Dialogue is dry and transactional; horror is spoken as logistics. Keep the violence implied or off-frame; the frame holds faces and objects.',
  },
  {
    id: 'bi8.drama.action',
    name: 'Action',
    instructions: 'Sub-genre: ACTION. A hidden-power or comeback story told through physical consequence: the lead is underestimated, then capable, then hunted. Openings: a threat already in motion (a blade at a throat, a car that will not stop, a hand on the door). Turns subtract a resource, an ally or an escape route; every sequence ends with something lost. Villains boast before they strike. Hooks are an entrance, a weapon drawn, an identity exposed. Keep fights to two or three people, short, close and legible on a phone; the frame favours hands, faces and a single object over choreography.',
  },
  {
    id: 'bi8.drama.romance',
    name: 'Romance',
    instructions: 'Sub-genre: ROMANCE. Contract marriage, forced proximity, the cold executive and the dismissed employee, the fiancé who belongs to someone else. The engine is the gap between public obligation and private feeling, moving at different speeds. Openings: a status flip (the engagement announced to the wrong person, the stranger who is the new boss, the ex at the altar). Turns are rules broken by one side and noticed by the other. The rival humiliates in public; the lead is proven in front of the same people. Hooks are a confession withheld, a touch interrupted, a ring, a door. Lines are clean and direct about circumstance, never about feeling; the body says what the words deny.',
  },
  {
    id: 'bi8.drama.mystery',
    name: 'Mystery',
    instructions: 'Sub-genre: MYSTERY. One question drives the season (who did it, who is she, what happened that night) and each episode answers a smaller one while opening a larger one. Openings: evidence that contradicts the official story, found by the wrong person. Turns are clues that change who is trusted. Villains hide in plain sight and misjudge the lead as harmless. Hooks lean on realisation (the earlier judgement was wrong) and identity (the ally who was the author). Keep a ledger: every planted clue pays off on screen. Dialogue is interrogation under pressure; objects (a photo, a key, a message) carry more than words. Never let a reveal arrive as narration.',
  },
  {
    id: 'bi8.drama.scifi',
    name: 'Sci-fi',
    instructions: 'Sub-genre: SCIENCE FICTION. One rule of the world is different (a memory can be sold, a body can be swapped, a message arrives from tomorrow) and the drama is what it does to a family, a marriage or a debt. Openings: the wrong body, the wrong year, the device that just said something it should not know. Turns are the rule\'s consequences closing in; keep the technology small, physical and in the frame (a wristband, a screen, a door that reads faces), never spectacle. Villains own the rule. Hooks reveal who is really human, really alive, really remembering. Dialogue stays everyday; nobody explains the science for more than one line.',
  },
  {
    id: 'bi8.drama.fantasy',
    name: 'Fantasy',
    instructions: 'Sub-genre: FANTASY. Rebirth, second chances, hidden bloodlines, the power that wakes when it is mocked. Openings: a rule break (the "dead" gift ignites, the prophecy names the servant, the curse chooses the bride). Turns are costs of using the power and the hierarchy noticing. Villains hold rank and misjudge the lead\'s station in public; payoffs reverse that misjudgement before witnesses. Hooks are identity (true lineage), realisation (the mentor\'s motive) and emotion (the vow). Keep magic legible in a close-up: a mark on the skin, a flame in the hand, eyes that change. Costumes and settings stay few and consistent for AI generation.',
  },
  {
    id: 'bi8.drama.brainrot',
    name: 'Brainrot',
    instructions: 'Sub-genre: BRAINROT. Maximal, meme-literate, deliberately overclocked melodrama: outrageous premises played with total sincerity, instant escalation, reactions bigger than the cause, a new shock every ten seconds. Openings: the most insane sentence of the premise spoken as fact. Turns are one-upmanship of absurd reveals; villains are cartoonishly smug; payoffs are humiliations of operatic scale. Hooks are twists that recontextualise everything, delivered deadpan. Dialogue is short, quotable, caption-ready, built from repeated catchphrases the characters own. Still obey the format: one unit per episode, a face at the cut, nothing explained twice.',
  },
  {
    id: 'bi8.drama.surrealism',
    name: 'Surrealism',
    instructions: 'Sub-genre: SURREALISM. Dream logic with a melodrama\'s heart: a room that grows at night, a husband who is two people, a wedding that repeats until it is done right. The emotional stakes stay ordinary (love, debt, shame, inheritance); the world bends around them. Openings: an impossible image presented as routine. Turns are new rules of the dream that remove an option; villains are the ones who understand the rules. Hooks are realisations about what the strangeness has meant all along. Dialogue is calm and literal about impossible things; characters never comment on the strangeness, they negotiate with it. Keep each surreal element a single clear visual AI can render (one object, one wrong detail) rather than a storm of effects.',
  },
];

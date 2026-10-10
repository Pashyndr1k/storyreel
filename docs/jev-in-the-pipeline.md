# Where the Jev model fits StoryReel's pipeline

Jev (TypeSafe "System One", `jev-latest`) is not a generator: it takes a
`state` (text or JSON, up to 32k tokens) and typed questions — **Choice**
(pick one of N), **Score** (a number), **Noul** (probability of "yes") — and
answers all of them in parallel in ~0.1 s at $0.042 per million input
tokens, output free. It is weak at counting, dates, multi-hop reasoning and
large noisy states, and best in English. That profile makes it a cheap,
fast **judge** next to the expensive generators, never a writer.

The short-drama engine (`src/lib/shortDrama`) now produces structured,
checkable material: hook types, beats, turns, open questions, timing
windows, measured layouts, prompts. Each is a place where a deterministic
check (`check.js`) catches the mechanical part and a one-line judgement
would catch the semantic part. Those judgements are what Jev is for.

## Candidate points, ranked

1. **Hook-type verification (Choice).** State: an episode's summary + its
   cliffhanger. Question: "Which hook does this ending set — identity,
   emotion, realisation, or none?" Compared with the model's own label;
   disagreement → a warning in the genre check. Today the check trusts the
   label blindly. Cost: a few hundred tokens per episode.
2. **Opening test (Noul).** State: the first shot's action + dialogue.
   "Is a conflict visible or spoken in this shot without any further
   context?" Replaces the keyword heuristic in `check.js` (`opening-quiet`).
3. **Turn detection (Noul per shot).** "Does this shot change who holds
   the leverage, or remove an option from the lead?" Gives the real count of
   turns per episode instead of relying on the `beat` labels the writer
   assigned; feeds `few-turns` and `flat-run`.
4. **Line hygiene (Noul per line).** "Does this line state an emotion the
   face already shows?", "Does this line advance the conflict or reveal
   character under pressure?" — the two dialogue rules no regex can check.
   ~20 lines per episode × 2 questions, still under a cent.
5. **Ranking the four Stage 1 directions (Score).** State: the four pitches
   + the sub-genre brief. "How strongly does this direction promise the
   format's engine (a trope, an opening pressure, a first win, a quarter
   hook)?" The UI could order the cards by score and badge the top one;
   the user still picks.
6. **Prompt–shot agreement (Noul).** State: the shot's action + the image
   prompt (or the measured layout description + the prompt). "Does the
   prompt stage what the shot describes?" A pre-render gate that is cheaper
   than a Nano Banana frame.
7. **Picking among N candidate prompts (Choice).** When a prompt is
   regenerated several times, Jev picks the one that best fits the shot
   and the rules — the "best of N" pattern without a second big model.
8. **Agent triage.** The MCP agent could ask Jev before spending an attempt:
   "Is this review finding a convention break or a taste issue?" — keeping
   the four-attempt budget for real problems.
9. **Content-policy pre-check (Noul).** "Does this prompt conflict with the
   policy text?" before the generator call; cheaper than a refusal
   round-trip. Only as a pre-filter — the model's own policy check stays.

Not a fit: anything that needs a rewrite (Jev does not generate), counting
words or seconds (the deterministic check does that better), judging a
rendered frame (text only — the layout description or a caption would have
to stand in for the image).

## How it would be wired

- `src/lib/jev.js`: one client (`ask(state, questions)`) over
  `POST /v1/systemone`, key in `settings.typesafeKey`, English prompts; a
  Settings field like the other keys; nothing runs without the key.
- `check.js` gains an async `semanticCheck(project)` that adds Jev-backed
  issues (`hook-mismatch`, `opening-no-conflict`, `line-restates-emotion`,
  `turn-count`) to the deterministic report; the genre-check modal and
  `storyreel_drama_check` show them under a "semantic" level.
- Stage 1: an optional score badge on the idea cards.
- Russian / Ukrainian scripts: the check would send the English prompt
  texts (Stage 5) as-is and the script text through a short translation, or
  simply be tested first — the memory note says non-English content must be
  evaluated before relying on it.

## Order of adoption

Start with 1–3 (they strengthen the genre check immediately and are easy to
validate against the human eye), then 4, then the Stage 1 ranking. Measure
agreement with the user's own judgement on a few episodes before showing
any Jev result as an error rather than a note.

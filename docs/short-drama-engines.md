# The two short-drama engines, compared

StoryReel writes a vertical series with one of two engines, chosen when the
project is created (`project.dramaEngine`, `src/lib/shortDrama/engine.js`):

- **Short drama** (`v1`, `rules.js`) — built in 2.16 from the 2026 craft
  guides and OutlierKit's 50-episode sheet.
- **Short Drama 2** (`v2`, `rules2.js`) — built in 2.17 from the *AI Short
  Drama Series: Production Manual* and the sixteen articles it cites, written
  for MiniMax H3 video and Nano Banana 2.1 images.

Both are series projects; every text stage, the prompt writers, the genre
check and the agent read the engine through `rulesFor(project)`.

## What they agree on

- 9:16, one dramatic unit per episode of one to two minutes, the conflict
  visible before the context, a turn about every 30 seconds, a labelled
  cliffhanger at the cut, no two consecutive episodes on the same type.
- Lines short enough for a caption, no voice-over, no inner monologue, no
  em dashes in dialogue, dialogue that advances the conflict.
- A small cast, few locations, close-ups as the baseline, alternating singles
  for a two-person exchange, inserts for objects, the lower part of the frame
  kept clear for captions.
- A sub-genre brief colours tone and plot types but never overrides the engine.

## Where they differ

| | Short drama (v1) | Short Drama 2 (v2) |
|---|---|---|
| Source | craft guides, a 50-episode planning sheet | the production manual and its cited practitioners |
| Unit of thought | the **dramatic unit**: one charged situation that changes state and stops before it settles | the **beat sheet**: hook, friction, turn, spike, button |
| Beats on scenes and shots | open · orient · turn · squeeze · reversal · cliff | hook · friction · turn · spike · button |
| Cliffhanger types | 3: identity, emotion, realisation, with a fixed opening sequence for episodes 1–5 | 6: revelation, reversal, deadline, intrusion, new arrival, withheld decision; no fixed sequence, only rotation |
| Last shot's note | `HOOK · IDENTITY` | `CLIFF · REVELATION` |
| Opening | the conflict in 0–3 s, at most 5 s: ordinary state + visible disruption + unanswered question | the hook readable in 3 s by a stranger from the feed; a shocking line, an action under way, a reveal or a reaction; never scenery, voice-over or a recap |
| Scene openings | every scene opens on a shot without dialogue (atmosphere, 2–4 s) | the episode's first scene opens on the hook (which may be a line); later scenes open on a close detail of the new place |
| Progression test | the lead **loses options**: a fact counts only if it changes leverage, what must happen next or what the audience believes | **"what changed?"**: an episode with nothing different at the end is merged with the next; the spike must pass the mute test |
| Shift cadence | something shifts every 15 s | 8–10 s blocks, each adding information, tension or an emotional shift |
| Season landmarks | first win by episode 5, first reversal around 16%, paid checkpoint at the first quarter, mid-season betrayal at the half, climax at 96% | episode 1 ends when the problem becomes personal, 2 on the opponent's first move, 3 on the first failed attempt; the paywall is the last free episode (5–10 on a long run); the twist lands from two before to one after it; phases establish / deepen / darkest / resolve |
| What the paywall episode carries | "the strongest hook so far", an identity or realisation jaw-drop | "the strongest reveal of the season so far"; the first paid episode pays it off inside ~10 s and opens a new question |
| Plot mechanisms | expectation contracts: hidden power, underdog revenge, contract relationship, second chance, mistaken rescue… | a four-part engine: a simple want, fresh obstacles, a ticking clock, an open question; information imbalance as the renewable source of turns |
| Characters | pressure functions: the lead stores delayed status, the avenger supplies a punch per episode, the rival keeps witnesses present | a fixed identity block pasted verbatim into every prompt, 2–3 anchor attributes, what may not change; one or two characters per scene |
| Dialogue budget | about 3 words a second; lines ≤ 20 words; 18–25 effective lines an episode | 135 words a minute (≈ 2.25 a second); lines ≤ 16 words; ≈ 203 words per 90 s, 270 per 120 s |
| Speaking mouth | no limit | no shot keeps a speaking mouth on screen past ~5 s of one line; longer lines are covered by reactions and inserts |
| Locations | up to 4 per episode | 2 per episode, 3 per series, each with one immutable detail and a key-light direction; a scene change at most every 20 s |
| Shots | 2–10 s as the app allows | 3–6 s, one beat each; 3–5 anchor shots planned first; extra reaction shots for cover |
| The frame rule | 100 words: faces and hands, foreground power / background threat, lower fifth clear | 500 words: vertical zones (face in the top third, evidence in the middle, bottom third quiet, right edge clear), depth built vertically, establish by detail; identity block rules; the Nano Banana 2.1 image prompt shape; the MiniMax H3 video prompt shape |
| Check (deterministic) | first win by episode 5; a held emotion on the paywall episode is flagged; every scene must open without dialogue | a deadline or withheld decision on the paywall episode is flagged; `long-speech` (a speaking mouth past 5 s); `locations-series` (more than three across the series) |
| Brief length | 1,058 words + stage briefs of 72–187 words | 1,364 words + stage briefs of 113–241 words |

## What that means in practice

- **v1 is a drama engine; v2 is a production engine.** v1 spends its words on
  how a scene excavates pressure and how characters function. v2 spends them
  on how the viewer behaves (the free episodes, the paywall, the first paid
  episode) and on how the clip will be generated (identity blocks, shot
  lengths, mouth-visible seconds, lens and light). A writer who wants the
  stronger dramatic grammar picks v1; a producer who wants clips that survive
  AI generation and a season that sells picks v2.
- **v2 is stricter.** Shorter lines, fewer locations, shorter shots, a hard
  cap on speaking mouths. Its outputs cut cleaner into H3 takes; its scripts
  read terser. v1 allows more room inside a scene and a larger cast of
  pressure functions.
- **The cliffhanger vocabulary is richer in v2** (six types against three)
  and freer (no fixed opening sequence), so a long season repeats itself
  less; v1's three types are more precise about *what* changes (identity,
  feeling, judgement), which helps a short run.
- **The paywall sits in different places.** v1 puts the paid checkpoint at
  the first quarter of the season; v2 at the last free episode, roughly a
  tenth of a long run or the middle of a short one. On an 8-episode series
  that is episode 2 against episode 4.
- **Scene openings differ on purpose.** v1 lets the viewer settle into every
  new place with a wordless shot; v2 forbids that at the top of an episode
  (the hook must be readable in 3 s) and allows a close detail only for the
  later scenes.
- **The frame rule is where v2 earns its name:** it is the part that talks
  to the image and video models directly, and it is five times longer.

## Which to choose

Use **Short Drama 2** for anything that will be generated with MiniMax H3 and
Nano Banana 2.1 and published on an app with a paywall. Use **Short drama**
when the series is short, the cast is larger than two, or the writing matters
more than the generation.

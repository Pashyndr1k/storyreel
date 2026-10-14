# Unreleased (after 2.18.0)

Base: tag `v2.18.0` (commit `77a966e`). All work below is on `main`, local.

Conventions that apply to every change: UI strings exist in EN/RU/UA in
`src/lib/i18n.js` (`const en`, `const ru`, `const uk`); every button, header
and indicator carries a hover hint (`title`); buttons are three words at most.

---

## 1. Against the formulaic plot: verbalized sampling, the subversion pass, writing rules

**Request.** The four plot directions kept using the same narrative
techniques; find techniques beyond the randomization engine that keep the
model off the obvious path without breaking coherence; the Stage 2
subversion pass is wanted; a set of writing techniques is to apply at
Stages 3 and 4. Sources: "Verbalized Sampling: How to Mitigate Mode
Collapse and Unlock LLM Diversity" (Zhang, Yu, Chong, Sicilia, Tomz,
Manning, Shi; arXiv 2510.01171, ICML 2026) and the VentureBeat write-up.

**A. Verbalized sampling at Stage 1 (`VS_RULE`, `src/lib/prompts.js`).**
The paper shows that asking for one answer collapses to the most typical
one (typicality bias in preference data), while asking for several
candidates as samples from the whole distribution, each with its
verbalized probability, recovers most of the base model's diversity;
capping the probability ("every response below 0.10") tunes it further,
at about +12% cost. The Stage 1 prompt now frames the four directions as
such samples: each carries its estimated probability relative to all the
directions a room of strong writers would propose, every one must sit
below 0.10 and come from a different region, and a silent pre-step lists
the ten most obvious directions and discards them (the consensus killer).
For a series the space is bounded by the engine. The JSON gains
`probability`; Stage 1 shows it on the idea card as "typicality N%"
(`s1.typicality`, tip), kept on pinned ideas.

**B. The subversion pass at Stage 2 (`SUBVERSION_PASS`).** Before the
synopsis the model lists the three turns a reader would predict from the
approved direction (the expected betrayal, rescue, ending, reveal), keeps
at most one as a feint and replaces the rest with turns that follow from
these characters' wants and this world's rules, as strong as the cliché
they displace. The JSON gains `subversions` (2–3 entries); Stage 2 stores
them in `storyline.subversions` and shows them under the synopsis
("Instead of the expected: …", `s2.subversions`, tip).

**C. Writing rules for Stages 3–4 and the smart edit (`WRITING_RULES`,
`withWriting`).** Appended to the system prompt of the scene outline
(both engines), the shot breakdown (both) and the smart edit — never to
the image / video prompt writers. Adapted from the supplied list for
screenwriting: the consensus killer per scene and per shot; a banned list
of stock images, stock lines and the assistant register, with the rule to
write what the camera sees instead; sentence-structure rules (no three
parallel sentences, no "not X, but Y", no two action blocks opening alike,
deliberate length variation, no two scene summaries opening alike);
specificity (one concrete anchor per action block, nothing that would be
true in another film); imperfection (one odd observed detail and one
sayable line per scene); the read-aloud loop.

**Not built yet (proposed, awaiting the choice).** Story dice (user-typed
or rolled words pinned to beats of the timeline), the story interview
(three context-drawn questions before Stage 2) and structure dice (a
random dramatic situation applied to one act) — see the message to the
user.

**Verified** in node: Stage 1 (short and series) carries the sampling rule
and the probability field; Stage 2 (both) the pass and the field; Stage 3,
Stage 4 and the smart edit carry the writing rules; the Stage 5 image
prompt does not.

**Files.** `src/lib/prompts.js`, `src/stages/{Stage1,Stage2}.jsx`,
`src/lib/i18n.js`.

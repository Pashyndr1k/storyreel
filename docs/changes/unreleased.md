# Unreleased (after 2.19.4)

Base: tag `v2.19.3` (commit `86133ba`) + local 2.19.4. All work below is on
`main`, local.

Conventions that apply to every change: UI strings exist in EN/RU/UA in
`src/lib/i18n.js`; every button, header and indicator carries a hover hint
(`title`); buttons are three words at most; sharp corners only.

## 1. Agent: tools for every app edit, the graphic novel, and skills

**Why.** The agent API covered the video pipeline only. It could not edit
character cards, scenes or shots lists, styles, preferences or projects, and
had no tools at all for the graphic novel format.

**Edit tools (`src/lib/agent/editTools.js`).**
- `storyreel_manage_project`: pin, unpin, archive, unarchive, duplicate (a
  full copy with media) or delete. Delete needs `confirmTitle`.
- `storyreel_set_plot_options`: the Stage 1 originality switches and
  randomization methods.
- `storyreel_edit_storyline`: the synopsis.
- `storyreel_set_character`: create, edit or delete a card, and add or
  remove a photo (`data:image` URL, resized).
- `storyreel_character_portrait`: a portrait from the description (Gemini,
  project image style). Counts as an attempt.
- `storyreel_set_group`: actor groups.
- `storyreel_edit_outline`: add, delete or move scenes. A delete removes
  the shots' prompts, media and comic screens.
- `storyreel_edit_shots`: add, delete or move shots, with the same cleanup.
- `storyreel_set_location`: a scene's locations and photos.
- `storyreel_set_style`: create, edit or delete library styles. Built-ins
  are read-only.
- `storyreel_app_settings`: read or set the non-secret preferences (lang,
  theme, text / image / video service, models). Keys are refused.

**Graphic novel tools (`src/lib/agent/novelTools.js`).**
- `storyreel_novel_rules`: the screen, the layout templates with their
  boxes and ratios, the composition rules, the lettering limits and the
  image rules.
- `storyreel_novel_get`: the screens as data, with measured issues per
  screen (`screenIssues`). The issues are:
  - more than 2 balloons in a panel;
  - more than 25 words in a balloon;
  - a balloon reaching below 60% of the panel;
  - overlapping balloons;
  - balloons covering over 40% of the image;
  - cut captions;
  - unknown speakers or characters;
  - the same framing in adjacent panels;
  - script lines missing from the balloons.
- `storyreel_novel_plan`: the planner for a scene or one screen. Counts as
  an attempt.
- `storyreel_novel_set_screen`: layout, per-panel framing, characters,
  prompt, caption, balloons and clearImage, plus balloon moves. It is
  validated before writing.
- `storyreel_novel_draw`: one panel, a screen's missing panels or a scene's.
  Each panel counts as its own attempt.
- `storyreel_novel_review`: the rendered screen, each panel and the
  character and location references as images, plus the issues.
- `storyreel_novel_export`: PNG export.

**Existing tools.**
- `storyreel_create_project` takes `format: "novel"` (series, v2, 9:16).
- `storyreel_get_project` and `storyreel_list_projects` show `format`, plus
  a `comic` summary for novels. The list tool has a new `includeArchived`
  option and shows pinned projects.
- `storyreel_create_prompts`, `storyreel_create_media` and
  `storyreel_render` refuse a graphic novel and point to the novel tools.
- The app's agent scope gained `setStyles`, `patchSettings` and
  `removeProject`, and `updateProject` now passes its options.
  `SHOT_MAPS` is exported from `split.js`.

**Skills (`agent/skills/`, shipped with the app).** The five skills are
`storyreel` (operator), `storyreel-editing`, `storyreel-short-drama`,
`storyreel-video` and `storyreel-graphic-novel`, plus a README.
- The MCP server (`agent/storyreel-mcp.mjs`, 1.1.0) serves them as MCP
  prompts (`prompts/list`, `prompts/get`).
- Its local tool `storyreel_install_skills` copies them to
  `~/.claude/skills` or a project's `.claude/skills`. It works with the app
  closed.
- Settings → Interface → Agent access shows a copyable install command
  (PowerShell on Windows), with strings `set.agentSkillsHint`,
  `tip.agentSkills` and `tip.agentSkillsCopy`.

**Agent guide.** The guide now has a pipeline row for the comic, a project
delete rule and the new character-photo tools. New sections are "Editing a
project by hand" (a change → tool table, and what direct edits leave alone)
and "Graphic novel" (the workflow and the review checklist).

**Verified.** In the dev app through `window.__storyreelAgent`, with
stubbed models, every new tool ran:
- plan → issues → set_screen (framing, a long balloon flagged, a balloon
  move, a layout switch and back, clearImage) → draw → review (4 images)
  → export;
- the video tools refused the novel;
- create, edit, portrait and delete of a character; groups; synopsis; plot
  options;
- scene add, move and delete; shot add and delete, which removed the comic
  screen from the stored record;
- location add;
- style create, edit and delete, with the built-in refused;
- settings get and set, with a key refused;
- project pin, duplicate (comic and media copied), archive, and delete
  (refused without, done with confirmTitle);
- creating a novel gave series, Short Drama 2, 9:16.

One bug was found and fixed: clearImage in the same call as a layout
change, since React runs state updaters lazily.

The MCP server was tested over stdio with the app offline: prompts/list,
prompts/get, the tool list with the installer, and an install into a
scratch folder.

**Files.** `src/lib/agent/editTools.js` (new),
`src/lib/agent/novelTools.js` (new), `src/lib/agent/api.js`, `src/App.jsx`,
`src/lib/split.js`, `src/components/SettingsModal.jsx`, `src/lib/i18n.js`,
`agent/storyreel-mcp.mjs`, `agent/AGENT_GUIDE.md`, `agent/skills/**` (new).

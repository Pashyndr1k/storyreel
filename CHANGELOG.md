# Changelog

## 1.0.3 — in development

- Per-project settings menu (🎛 in the project header) with:
  - editable project title;
  - a custom "System prompt" — extra instructions added to every generation in
    that project (tone, style rules, things to avoid), on top of the built-in rules;
  - optional image/video prompt templates — when set, Stage 5 fits each generated
    prompt to the template; left blank, prompts stay free-form as before.
- These settings travel with the project through .md export/import.

## 1.0.2 — 2026-07-06

- Ukrainian (UA) interface language, alongside English and Russian.
- Per-project script language override: each project can generate its content in
  EN, RU or UK independently of the app language (selector in the project header).
- "⚡ Break down all scenes" button on Stage 4 — batch-processes every scene with
  one click (skips scenes that already have breakdowns; offers full regeneration
  when everything is done).
- "⚡ Prompts for all scenes" button on Stage 5 — same one-click batch processing
  for image/video prompts.
- Duplicate button (⧉) on project cards for making variants of a project.
- Character cards accept up to 3 reference photos; a "Describe appearance from
  photos" button uses Claude vision to write the character description from them.
- Scenes accept up to 3 environment reference photos (Stage 4); they are sent to
  Claude during shot breakdown and prompt generation so locations, lighting and
  mood match the references.
- Export/import projects as .md: the exported script now embeds the full project
  data, and a new "Import project" button on the main page restores a complete
  project (including photos) from such a file.

## 1.0.1 — 2026-07-06

- Interface language selector (English / Russian): EN/RU dropdown on the main page
  and a setting in ⚙ Settings.
- Full UI translation, including localized dates and Markdown export headings.
- All script generation stages (ideas, storyline, outline, shot breakdown) now
  produce content in the selected language, regardless of input language.
- Image prompts (Nano Banana) and video prompts remain English-only by design.

## 1.0.0 — 2026-07-06

- Initial release: five-stage writing pipeline (Plot & Ideas → Storyline →
  Scene Outline → Shot Breakdown → Generation Prompts).
- Main page with project cards (title, genre tags, Open / Archive / Delete),
  keyword search, sort by creation date, and a separate Archive page.
- Per-user Anthropic API key and model selection in Settings; local storage
  with JSON backup export/import.
- Full script export as Markdown.
- Windows installer + portable exe; GitHub Actions workflow for Windows and
  macOS builds; StoryReel.bat launcher for running from source.

# Change companions

One file per version, written for a developer (or another Claude session) who
works on a parallel copy of StoryReel and needs to reproduce or merge the
changes without this repository's history.

- `unreleased.md` collects the changes made since the last tagged version.
  When a version is bumped it is renamed to `<version>.md` (e.g. `2.12.0.md`)
  and a fresh `unreleased.md` is started with the next change.
- `CHANGELOG.md` at the repository root stays the user-facing summary; the
  files here are the technical counterpart.

Each entry states: what the user asked for, the behaviour now, the data-model
changes (project fields, settings, stored formats, migrations), every file
touched and what changed in it, the new i18n keys, how it was verified, and
anything left open.

The companions start with the changes after v2.11.0; earlier versions are
covered by `CHANGELOG.md` and the git history only.

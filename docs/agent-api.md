# StoryReel agent access

StoryReel can be operated by an AI agent — Claude Code or any program that can
make HTTP requests. The agent runs the stages, creates frames and videos,
checks each result, fixes what it can and flags what it cannot.

The agent drives the open desktop app: you see every step in the window, and
you can stop it at any time by closing the app or turning the access off.

## Turning it on

1. Settings → Interface → **Agent access** → tick "Allow an AI agent to operate
   the app" → Save. (Desktop app only; off by default.)
2. Open Settings again: the block now shows "Listening on port 47821" and a
   command. Copy it and run it once in a terminal:

   ```
   claude mcp add storyreel -- node "<path shown in Settings>/storyreel-mcp.mjs"
   ```

3. Start Claude Code and ask it, for example:

   > Use the storyreel tools. Read the guide, then make a 30-second film from
   > this idea: … Check every frame and video before moving on.

   or

   > Continue the StoryReel project "Harbour": finish the missing videos of
   > scene 2 and tell me what you flagged.

StoryReel must stay open while the agent works. The agent spends your API
keys and your GPU exactly as the buttons do.

## What the agent can do

| Tool | Purpose |
|---|---|
| `storyreel_guide` | The operating guide (pipeline, checks, fixes, rules). Read first. |
| `storyreel_status` | App version, open project, which services are configured. |
| `storyreel_list_projects`, `storyreel_create_project` | Find or start a project. |
| `storyreel_get_project` | The whole project as text, with what media each shot has. |
| `storyreel_update_project` | Title, plot, aspect ratio, and the script / image / video style. |
| `storyreel_list_styles` | The style library, to choose a look that fits the story. |
| `storyreel_run_stage` | Stages 1–4: ideas, storyline, outline, shot breakdown. |
| `storyreel_pick_idea` | Stage 1: approve one of the directions. |
| `storyreel_edit_script` | Edit one scene or shot directly. |
| `storyreel_smart_edit` | One instruction applied consistently across the project text. |
| `storyreel_create_prompts`, `storyreel_set_prompt` | Stage 5 prompts: written by the app, or supplied by the agent. |
| `storyreel_set_dynamics` | A shot's camera and dynamics settings. |
| `storyreel_create_media` | A shot's first frame, final frame, video or voice. |
| `storyreel_review_shot` | Evidence for checking a shot (see below). |
| `storyreel_flag`, `storyreel_list_flags` | Record and list problems for you. |
| `storyreel_render` | Render the assembled timeline. |

It cannot read or change API keys, add reference photos, delete projects, or
change app settings.

## How results are verified

`storyreel_review_shot` gives the agent two things.

**Measurements** (facts, computed by the app):

- video length against the shot's slot (`shortBy`);
- the video's own sound and the voice clip: duration, silence before and
  after, and `endsAbruptly` — sound still going when the file ends, which is
  how cut-off speech shows up;
- `voiceOverrunsShot` — the voice is longer than the shot and would be cut in
  the edit;
- optionally a transcript of what is actually said.

**Images to look at** (the agent judges these itself):

- the reference photos of the characters named in the shot;
- the location and asset references;
- the last frame of the previous shot;
- the shot's first and final frame;
- a numbered contact sheet of frames across the video.

From those it checks likeness to the references, that the action continues
the previous shot, that the environment and assets stay consistent, and that
there are no artifacts (cropped bodies, extra limbs, fused figures, frozen
video).

## Limits that are enforced

- **Four attempts.** Every generation the agent starts is counted per target —
  a stage, a scene's prompts, or a shot's frame / final frame / video / voice /
  prompt. The fifth is refused and the target is flagged automatically. A
  failed attempt (an API error, for instance) counts too.
- **One thing at a time.** While one generation runs, others are refused.
- **Order.** A video needs its first frame; a render needs every shot to have
  a video or a flag.

## Flags

A flag is a note attached to a shot, a scene or a stage: what is wrong, what
was tried, how many attempts were made. Kinds: likeness, continuity,
environment, audio, artifact, style, script, other.

Open flags show as a red flag button with a count in the project header, and
as a red dot on the shot's clip on the timeline. The list lets you jump to the
item and **Resolve** it; resolving also resets its attempt counter, so the
agent may work on it again.

## Using it without Claude Code

The MCP server is a thin bridge over a local HTTP API. Connection details are
in `agent.json` in the app's data folder (`%APPDATA%\StoryReel` on Windows):
`{ "url": "http://127.0.0.1:47821", "token": "…" }`.

```
GET  /health                     → { ok, result: { name, version } }
GET  /tools                      → { ok, result: [ { name, description, inputSchema } ] }
POST /call   { "method": "storyreel_get_project", "params": { "projectId": "…" } }
             → { ok: true, result } | { ok: false, error: { code, message } }
```

Every request needs `Authorization: Bearer <token>`. The server listens on
127.0.0.1 only and refuses requests that come from a web page.

Error codes: `ATTEMPT_LIMIT`, `BUSY`, `NOT_READY`, `NOT_FOUND`, `BAD_INPUT`,
`NO_KEY`, `GENERATION_FAILED`, `UI`, `APP_NOT_READY`, `TIMEOUT`,
`UNKNOWN_TOOL`.

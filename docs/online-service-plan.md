# StoryReel Online — plan

Status: draft for review, 2026-10-02. Nothing here is built yet.

## 1. What is being built

A second, independent edition of StoryReel that runs as a website. A Linux
server hosts the app and brokers every generation request; users sign in with
Google and work in the browser. The desktop edition stays as it is.

Decisions already made:

| Topic | Decision |
|---|---|
| Access | Google sign-in, restricted to an invite list; per-user generation limits |
| User data | Projects and media live in a folder on the user's own disk (Chrome and Edge only) |
| Final render | ffmpeg in the browser; media does not leave the user's computer for rendering |
| Generation | APIs only, keys held on the server; no ComfyUI |
| Providers | To be named by the owner (see section 6) |
| Monetization | None |

One consequence to accept up front: "the server only orchestrates" means the
server stores no user content, but prompts, reference images and generated
media do pass **through** it on the way to and from the providers. That is
unavoidable when the keys stay on the server.

## 2. Architecture

```
Browser (the StoryReel app)                Linux server                    Providers
---------------------------------          ----------------------------    ---------------
UI, all five stages                        Google sign-in + invite list
Project folder on disk  <-- read/write     Session cookies                 Text model
Browser cache (thumbnails, handles)        Generation proxy  ------------> Image model
ffmpeg (WebAssembly) for render            Quotas + usage log              Video model
                         --- HTTPS --->    Async job tracker <------------ Voice / music / SFX
                                           Content policy (set by admin)
                                           Small database (users, usage, jobs)
```

**Browser.** The existing React app, built as a web target. Everything that
today goes through the Electron shell (files, ffmpeg, network calls with keys,
native dialogs, secure key storage) is replaced by a browser implementation or
a call to the server.

**Server.** One Node.js service behind a reverse proxy with TLS. It serves the
static app and exposes a small API:

- `auth` — Google OpenID Connect sign-in, session cookie, allowlist check.
- `generate/text|image|voice|music|sfx` — validates the request, checks the
  user's quota, applies the content policy, adds the provider key, forwards the
  call, streams the result back, records usage (counts and cost only, never
  content).
- `generate/video` — the same, but asynchronous: creates the provider task,
  returns a job id, lets the browser poll, and streams the finished file back.
- `admin` — invite list, per-user limits, usage totals, policy upload.

**Database.** SQLite is enough: users, limits, usage counters, open video jobs.
No projects, no prompts, no media.

**Storage on the user's machine.** The user picks a folder once (File System
Access API). Each project is a subfolder with `project.md`/JSON plus media
files, the same layout the desktop edition already mirrors to disk, so a
project folder can move between the two editions. The browser keeps only the
folder permission handle and a thumbnail cache.

## 3. What changes, subsystem by subsystem

| Subsystem | Desktop today | Online |
|---|---|---|
| Text generation | Browser calls Anthropic/Gemini with the user's key | Server proxy, server key |
| Images, voice | Browser calls Gemini with the user's key | Server proxy, server key |
| Video | ComfyUI (H3, LTX) or Kling via Electron | Provider API through the server, as async jobs |
| Music, sound effects | ComfyUI (ACE-Step, Stable Audio) | Provider API through the server |
| Project storage | IndexedDB plus a disk mirror via Electron | Folder on disk via the browser, written directly |
| Libraries (characters, locations, assets, styles) | IndexedDB / localStorage | Files in the same user folder |
| Render | ffmpeg binary via Electron | ffmpeg WebAssembly in a worker |
| Settings | API keys, ComfyUI URL, engines, folders | No keys or ComfyUI; model choice limited to what the admin enables |
| Content policy | User uploads a policy file | Admin sets it on the server; enforced server-side, cannot be switched off by a user |
| Updates | GitHub release check | Not needed; the site is always current |
| Dialogs, focus fixes | Electron main process | Plain browser dialogs |

## 4. Feature parity

Kept unchanged: stages 1–4 (plot, storyline, outline, shots), short drama
series planning and splitting, styles, groups, locations, timeline editing,
trims, transitions, audio lanes, auto queue, hover hints, three languages.

Kept through an API (needs a named provider): first and final frames, voice,
video, music, sound effects, storyboard frames, covers.

At risk — these exist only because of ComfyUI models and have no guaranteed
API equivalent:

| Feature | Depends on | Outcome if the chosen video API lacks it |
|---|---|---|
| Reference mode (video from reference images/videos/audio) | MiniMax H3 | Dropped or hidden |
| MULTI keyframes on the output timeline | MiniMax H3 | Dropped or hidden |
| Multi-shot takes (2–3 shots in one generation) | MiniMax H3 | Dropped; every shot generates alone |
| Native voice (the video model speaks the line) | MiniMax H3 | Voice always comes from text-to-speech |
| First + last frame video | LTX, Kling | Kept if the provider supports it (Kling does) |
| Sound-driven video | LTX | Dropped unless the provider offers it |

"Retaining all current features" therefore depends on the provider choice; the
table above is what must be checked against each candidate.

## 5. Code strategy

A separate repository (`storyreel-web`) started from the current code, as
requested. To keep the two editions from drifting apart more than necessary,
the first step in the fork is a thin **platform layer**: one module each for
storage, generation calls, rendering and dialogs. The stages and components
call the layer; only the layer differs between editions. Fixes to shared logic
(prompts, timeline, series planning) can then be copied across with little
friction.

## 6. Phases

| # | Phase | Result | Size |
|---|---|---|---|
| 0 | Decisions | Providers named and checked against section 4; domain, host and expected user count known | S |
| 1 | Server skeleton | Sign-in with Google, invite list, session, text proxy; stages 1–4 work online with browser storage as a stopgap | M |
| 2 | Folder storage | Projects, media and libraries read and written in the user's folder; import of desktop project folders | M |
| 3 | Images and voice | Frames, covers, storyboards and voice through the server; quotas and usage log | M |
| 4 | Video | Async video jobs, progress, recovery after a closed tab; auto queue on top of jobs | L |
| 5 | Render | ffmpeg in the browser: assembly, transitions, audio mix, export to the user's folder | L |
| 6 | Music and sound effects | Through the named providers | S–M |
| 7 | Operations | Admin page, limits, policy, deployment scripts, monitoring, backup of the server database | M |

Phases 1–3 give a usable writing-and-frames tool; 4–5 are where most of the
risk sits.

## 7. Risks

- **Browser render limits.** ffmpeg in the browser is several times slower
  than the native binary and is bound by browser memory. Long projects (a
  10-episode series part is up to 20 minutes) may need rendering in chunks, or
  may not render at all on weaker machines. This is the largest technical risk
  and should be prototyped before phase 4 is finished.
- **Browser support.** Folder access works in Chrome and Edge on desktop only.
  No Firefox, Safari or mobile.
- **Cost.** Every invited user spends the owner's API budget; video is the
  expensive part. Limits must exist from phase 3, not be added later.
- **Provider terms.** Some providers restrict serving many end users from one
  key; check the terms of each named provider.
- **Lost video jobs.** If a user closes the tab mid-generation the result must
  be collected later; providers keep results for a limited time only.
- **Data loss is the user's.** With no server copy, a deleted or corrupted
  folder cannot be restored by the service.
- **Google sign-in.** Basic sign-in scopes need no Google verification, but an
  app left in "testing" mode is capped at 100 users.
- **Parity gaps.** See section 4; decided by the provider choice.

## 8. Open questions for the owner

1. Providers for: text, images, video, voice, music, sound effects.
2. Roughly how many users, and what daily limits per user?
3. Domain name and where the server is hosted.
4. Should project folders stay interchangeable with the desktop edition?
5. Is a server-side render fallback acceptable later if browser rendering
   proves too limited for long projects?

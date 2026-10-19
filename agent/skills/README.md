# StoryReel agent skills

Claude Code skills for operating StoryReel through its MCP server
(`agent/storyreel-mcp.mjs`, tools named `storyreel_*`).

| Skill | Use it for |
|---|---|
| `storyreel` | Connecting, the pipeline, the guard rails, which skill to use. |
| `storyreel-editing` | Changing anything that exists: text, cast, scenes, shots, styles, settings, projects. |
| `storyreel-short-drama` | Vertical short-drama series (Short drama / Short Drama 2). |
| `storyreel-video` | Stage 5 of video projects: prompts, frames, videos, review, edit, render. |
| `storyreel-graphic-novel` | Graphic novels: comic screens, panels, balloons, captions, export. |

## Install

1. Connect the MCP server once (Settings → Interface → Agent access shows
   the command):

   ```
   claude mcp add storyreel -- node "<StoryReel>\resources\agent\storyreel-mcp.mjs"
   ```

2. Install the skills, either way:
   - ask the agent to call `storyreel_install_skills` (target `user` for
     every project, or `project` with a `projectDir`);
   - or run the command shown under Settings → Interface → Agent access. On
     Windows (PowerShell) it is:

     ```
     Copy-Item -Recurse -Force "<StoryReel>\resources\agent\skills\*" "$env:USERPROFILE\.claude\skills"
     ```

3. Start a new Claude Code session; the skills load at session start.

MCP clients without skills (Claude Desktop and others) get the same texts as
the server's MCP prompts.

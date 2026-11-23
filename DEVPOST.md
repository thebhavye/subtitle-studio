# Devpost submission text (copy and paste)

**Project name:** Subtitle Studio

**Tagline:** Fix, sync and convert subtitles in your browser. Nothing is uploaded.

**Live website URL:** <paste your Vercel/Netlify URL>
**GitHub repository:** <paste your GitHub URL>

## Description

Downloaded subtitles are often a few seconds late, or start in sync and slowly drift out of step because of a
frame-rate mismatch. Fixing that usually means installing desktop software or uploading your video to a random
site.

Subtitle Studio fixes it in one browser tab, and your files never leave your device.

**Try it in 10 seconds:** press "Try the demo". The captions are deliberately 2.5 s late, and an "Actually spoken"
bubble shows what is really being said. Drag the Quick shift slider and a badge turns green when you are in sync.
A second "drifting demo" shows the two-point sync, which fixes offset and drift together.

**Key features**
- Live preview on your own video (or audio) with `.srt` / `.vtt` files
- Quick shift, plus two-point sync that linearly stretches timing to fix frame-rate drift
- Edit text and times, add, delete and merge lines, set start/end from the playhead
- Quality check for reading speed, overlaps and very short lines, with one-click overlap fix
- Find and replace, undo/redo, caption style preview
- Export SRT, WebVTT or plain text
- Handles messy real-world files: BOM, CRLF, VTT notes/settings/tags, old Latin-1 encodings
- Keyboard shortcuts, accessible controls, light/dark theme, responsive down to phone width

**Built with:** HTML, CSS, vanilla JavaScript. No frameworks, no dependencies, no backend. The core logic is a
separate pure module with unit tests (`node test.js`).

**AI disclosure:** Built with the help of Claude (Anthropic) via Claude Code, then reviewed and tested. No
templates or external libraries.

**Creator:** <your name>, <your email>, team: <team name or "solo">

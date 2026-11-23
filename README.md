# Subtitle Studio

**Fix, sync and convert subtitles in your browser. Nothing is uploaded.**

Built for the Roxten Studios *Build Your Own Website* hackathon.

- Live site: `<add your Vercel/Netlify URL here>`
- Source: `<add your GitHub URL here>`

## The problem

Everyone has downloaded subtitles that are a few seconds late, or that start in sync and slowly drift out of
step (a classic frame-rate mismatch: 23.976 vs 25 fps). Fixing that normally means installing desktop software
or uploading your video to a random website.

Subtitle Studio does it in a browser tab. Your video and subtitle files never leave your device.

## Features

- **Try the demo**: captions that are deliberately 2.5 s late. A "Actually spoken" bubble shows what is really
  being said, and a badge turns green when you have fixed the timing. No files needed.
- **Quick shift**: drag a slider, see captions move live on the video, release to apply.
- **Two-point sync**: say when two lines are *really* spoken and every line in between is linearly stretched,
  which fixes offset **and** drift in one step. `t' = b1 + (t - a1) * (b2 - b1) / (a2 - a1)`
- **Live preview**: load your own video (or audio) plus `.srt` / `.vtt` and watch captions in sync.
- **Edit everything**: change text and times, add, delete, merge lines, set start/end from the playhead.
- **Quality check**: flags lines that are too fast to read (> 20 chars/s), too short, empty or overlapping.
  One click trims overlaps.
- **Find and replace**, **undo/redo**, caption style preview (size, colour, position, background).
- **Convert and export** SRT, WebVTT or plain text.
- **Robust import**: BOM, Windows line endings, VTT headers/notes/cue settings/inline tags, and old Latin-1 files.
- **Accessible**: keyboard shortcuts, labelled controls, ARIA tabs, visible focus, light/dark theme,
  reduced-motion support, responsive down to phone width.

## Tech

Plain HTML, CSS and vanilla JavaScript. There is no framework, no build step and no backend.

| File | Role |
| --- | --- |
| `subs.js` | Pure logic: parse/serialise SRT and VTT, shift, linear sync, overlap fix, analysis, find/replace. No DOM, so it runs in Node too. |
| `app.js` | UI and state: playback (real `<video>` or a virtual clock for the demo), list editing, undo/redo, export. |
| `style.css` | Theming with CSS variables, responsive layout. |
| `test.js` | Unit tests for `subs.js`. Run `node test.js`. |

Design choices worth noting: all transforms return new arrays (so undo/redo is just keeping old references),
captions are HTML-escaped before the few allowed tags (`<i> <b> <u>`) are re-enabled, and video is played from an
object URL so the file is never read into memory twice or sent anywhere.

## Run locally

```
python -m http.server 8000
```

then open http://localhost:8000. Or just open `index.html`. Run the tests with `node test.js`.

## Deploy

It is a static site, so any static host works: drag the folder onto https://app.netlify.com/drop, or run
`npx vercel --prod` in this folder.

## Disclosure of AI, templates and libraries

- **AI tools:** This project was built with the help of Claude (Anthropic) via Claude Code. It generated the
  initial code, which was then reviewed, tested and iterated on. I can explain every part of it.
- **Templates:** none.
- **External libraries:** none. No dependencies, no CDN scripts, no fonts. Icons are emoji and an inline SVG.

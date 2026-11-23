/* subs.js — pure subtitle logic (no DOM). Works in the browser and in Node for tests. */
(function (root) {
  'use strict';

  // "00:01:02,345" | "01:02.345" | "1:02:03.4"  ->  milliseconds (or null)
  function parseTime(str) {
    const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(String(str).trim());
    if (!m) return null;
    const ms = m[4] ? parseInt(m[4].padEnd(3, '0'), 10) : 0;
    return ((+(m[1] || 0) * 60 + +m[2]) * 60 + +m[3]) * 1000 + ms;
  }

  function formatTime(ms, sep) {
    ms = Math.max(0, Math.round(ms));
    const h = Math.floor(ms / 3600000);
    const m = Math.floor(ms / 60000) % 60;
    const s = Math.floor(ms / 1000) % 60;
    const r = ms % 1000;
    const p = (n, w) => String(n).padStart(w, '0');
    return p(h, 2) + ':' + p(m, 2) + ':' + p(s, 2) + (sep || ',') + p(r, 3);
  }

  // Strip format-specific markup we don't edit (VTT timestamps/voice/class tags, ASS {\an8}).
  function cleanText(t) {
    return t
      .replace(/\{\\[^}]*\}/g, '')
      .replace(/<\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}>/g, '')
      .replace(/<\/?(?:c|v|lang|ruby|rt)(?:[. ][^>]*)?>/gi, '')
      .trim();
  }

  let uid = 0;
  const nextId = () => ++uid;

  // Parses SRT or WebVTT. Returns { cues, format }.
  function parse(text) {
    text = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const format = /^\s*WEBVTT/.test(text) ? 'vtt' : 'srt';
    const cues = [];
    for (const block of text.split(/\n{2,}/)) {
      const lines = block.split('\n');
      const ti = lines.findIndex((l) => l.includes('-->'));
      if (ti < 0) continue; // header, NOTE, STYLE, stray index
      const [a, b] = lines[ti].split('-->');
      const start = parseTime(a);
      const end = parseTime((b || '').trim().split(/\s+/)[0]);
      if (start === null || end === null) continue;
      cues.push({ id: nextId(), start, end, text: cleanText(lines.slice(ti + 1).join('\n')) });
    }
    cues.sort((x, y) => x.start - y.start);
    return { cues, format };
  }

  const flat = (t) => t.replace(/\n{2,}/g, '\n');

  function toSRT(cues) {
    return cues
      .map((c, i) => `${i + 1}\n${formatTime(c.start, ',')} --> ${formatTime(c.end, ',')}\n${flat(c.text)}\n`)
      .join('\n');
  }

  function toVTT(cues) {
    return (
      'WEBVTT\n\n' +
      cues.map((c) => `${formatTime(c.start, '.')} --> ${formatTime(c.end, '.')}\n${flat(c.text)}\n`).join('\n')
    );
  }

  function toTXT(cues) {
    return cues.map((c) => stripTags(c.text)).join('\n') + '\n';
  }

  function stripTags(t) {
    return t.replace(/<[^>]+>/g, '');
  }

  // --- transforms (all return NEW arrays; inputs are never mutated) ---

  function shift(cues, deltaMs) {
    return cues.map((c) => ({ ...c, start: Math.max(0, c.start + deltaMs), end: Math.max(0, c.end + deltaMs) }));
  }

  // Two-point linear sync: map time a1 -> b1 and a2 -> b2 (fixes constant offset AND frame-rate drift).
  function linearSync(cues, a1, b1, a2, b2) {
    if (a1 === a2) return shift(cues, b1 - a1);
    const k = (b2 - b1) / (a2 - a1);
    const f = (t) => Math.max(0, Math.round(b1 + (t - a1) * k));
    return cues.map((c) => ({ ...c, start: f(c.start), end: f(c.end) }));
  }

  // Trim any cue that runs past the start of the next one.
  function fixOverlaps(cues) {
    const out = cues.map((c) => ({ ...c }));
    for (let i = 0; i < out.length - 1; i++) {
      if (out[i].end > out[i + 1].start) out[i].end = Math.max(out[i].start + 1, out[i + 1].start - 1);
    }
    return out;
  }

  // Characters per second (reading speed). Subtitle guidelines say <= ~20.
  function cps(c) {
    const chars = stripTags(c.text).replace(/\s+/g, ' ').trim().length;
    const dur = (c.end - c.start) / 1000;
    return dur > 0 ? chars / dur : Infinity;
  }

  // Human-readable problems per cue index.
  function analyze(cues) {
    return cues.map((c, i) => {
      const issues = [];
      if (c.end <= c.start) issues.push('End is before start');
      else if (c.end - c.start < 500) issues.push('Too short (<0.5s)');
      if (!c.text.trim()) issues.push('Empty text');
      else if (cps(c) > 20 && c.end > c.start) issues.push(`Too fast (${Math.round(cps(c))} chars/s)`);
      const n = cues[i + 1];
      if (n && c.end > n.start) issues.push('Overlaps next cue');
      return issues;
    });
  }

  function findReplace(cues, find, repl, opts) {
    if (!find) return { cues, count: 0 };
    const flags = opts && opts.matchCase ? 'g' : 'gi';
    const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    let count = 0;
    const out = cues.map((c) => {
      const t = c.text.replace(re, () => (count++, repl));
      return t === c.text ? c : { ...c, text: t };
    });
    return { cues: out, count };
  }

  const api = { parseTime, formatTime, parse, toSRT, toVTT, toTXT, stripTags, shift, linearSync, fixOverlaps, cps, analyze, findReplace };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Subs = api;
})(typeof window !== 'undefined' ? window : globalThis);

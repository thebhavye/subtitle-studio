// Run with: node test.js
const assert = require('assert');
const S = require('./subs.js');

// time parsing / formatting
assert.strictEqual(S.parseTime('00:01:02,345'), 62345);
assert.strictEqual(S.parseTime('01:02.345'), 62345);
assert.strictEqual(S.parseTime('1:02:03.4'), 3723400);
assert.strictEqual(S.parseTime('nope'), null);
assert.strictEqual(S.formatTime(62345, ','), '00:01:02,345');
assert.strictEqual(S.formatTime(3723400, '.'), '01:02:03.400');

// SRT with BOM, CRLF, multi-line cue
const srt = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\nHello <i>world</i>\r\nsecond line\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\nBye\r\n';
let r = S.parse(srt);
assert.strictEqual(r.format, 'srt');
assert.strictEqual(r.cues.length, 2);
assert.strictEqual(r.cues[0].text, 'Hello <i>world</i>\nsecond line');
assert.strictEqual(r.cues[0].end, 3500);

// VTT with header, NOTE, cue id, settings, inline tags
const vtt = 'WEBVTT - demo\n\nNOTE a comment\n\nintro\n00:01.000 --> 00:03.000 align:start position:0%\n<v Bob>Hi <00:02.000><c.yellow>there</c>\n\n00:04.000 --> 00:05.000\nOK\n';
r = S.parse(vtt);
assert.strictEqual(r.format, 'vtt');
assert.strictEqual(r.cues.length, 2);
assert.strictEqual(r.cues[0].text, 'Hi there');
assert.strictEqual(r.cues[0].start, 1000);

// round trip SRT -> VTT -> SRT keeps times
const vttOut = S.toVTT(S.parse(srt).cues);
assert.ok(vttOut.startsWith('WEBVTT\n\n00:00:01.000 --> 00:00:03.500'));
const back = S.parse(vttOut).cues;
assert.deepStrictEqual(back.map((c) => [c.start, c.end]), [[1000, 3500], [4000, 6000]]);
assert.ok(S.toSRT(back).startsWith('1\n00:00:01,000 --> 00:00:03,500'));

// shift never goes negative and doesn't mutate
const base = S.parse(srt).cues;
const sh = S.shift(base, -2000);
assert.strictEqual(sh[0].start, 0);
assert.strictEqual(base[0].start, 1000);

// two-point sync: offset 2s + 2% drift
const truth = [10000, 60000, 110000];
const drifted = truth.map((t, i) => ({ id: i, start: Math.round(t * 1.02 + 2000), end: Math.round(t * 1.02 + 2000) + 1000, text: 'x' }));
const fixed = S.linearSync(drifted, drifted[0].start, truth[0], drifted[2].start, truth[2]);
fixed.forEach((c, i) => assert.ok(Math.abs(c.start - truth[i]) <= 1, `cue ${i} off by ${c.start - truth[i]}`));

// analysis
const issues = S.analyze([
  { start: 0, end: 1000, text: 'a very long line of text that is read way too fast' },
  { start: 900, end: 1200, text: 'overlap and short' },
  { start: 3000, end: 4000, text: '' },
]);
assert.ok(issues[0].some((x) => x.includes('Too fast')));
assert.ok(issues[0].some((x) => x.includes('Overlaps')));
assert.ok(issues[1].some((x) => x.includes('Too short')));
assert.ok(issues[2].some((x) => x.includes('Empty')));

// fix overlaps
const fo = S.fixOverlaps([{ start: 0, end: 2000, text: 'a' }, { start: 1500, end: 3000, text: 'b' }]);
assert.ok(fo[0].end < fo[1].start);

// find / replace
const fr = S.findReplace([{ id: 1, start: 0, end: 1, text: 'Foo foo FOO' }], 'foo', 'bar');
assert.strictEqual(fr.count, 3);
assert.strictEqual(fr.cues[0].text, 'bar bar bar');
assert.strictEqual(S.findReplace([{ id: 1, start: 0, end: 1, text: 'a.b' }], '.', '-').cues[0].text, 'a-b');

console.log('All tests passed');

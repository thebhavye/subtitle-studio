/* app.js — UI + state for Subtitle Studio. All logic that touches subtitle data lives in subs.js. */
(function () {
  'use strict';
  const S = window.Subs;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- state ----------
  let cues = [];
  let fmt = null; // 'srt' | 'vtt' | 'demo'
  let baseName = 'subtitles';
  let past = [];
  let future = [];
  let hasVideo = false;
  let videoUrl = null;
  let demo = null; // { truth: [...], wasSynced: bool } while a demo is loaded
  const clock = { t: 0, playing: false, last: 0 };
  let activeId = null;
  let lastCaption = null;
  let shiftBase = null;

  const el = {
    video: $('video'), virtual: $('virtual'), empty: $('empty'), speaker: $('speaker'), speakerText: $('speaker-text'),
    caption: $('caption'), badge: $('badge'), stage: $('stage'), list: $('cue-list'), count: $('count'),
    play: $('btn-play'), time: $('time'), scrub: $('scrub'), speed: $('speed'),
    timeline: $('timeline'), trackCues: $('track-cues'), trackSpoken: $('track-spoken'), laneSpoken: $('lane-spoken'), playhead: $('playhead'),
    toast: $('toast'), fmt: $('fmt'), search: $('search'), follow: $('follow'),
  };

  // ---------- helpers ----------
  const mmss = (ms) => {
    ms = Math.max(0, ms);
    const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, d = Math.floor((ms % 1000) / 100);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + d;
  };
  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3200);
  }
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  // Escape everything, then allow only <i> <b> <u> so captions can show basic styling safely.
  const captionHTML = (t) => esc(t).replace(/&lt;(\/?)(i|b|u)&gt;/gi, '<$1$2>');

  // ---------- playback abstraction (real <video> or a virtual clock for the demo) ----------
  const duration = () => {
    if (hasVideo && isFinite(el.video.duration)) return (el.video.duration || 0) * 1000;
    if (hasVideo) return Math.max(el.video.currentTime * 1000 + 1000, ...cues.map((c) => c.end)); // streams/recordings with unknown length
    if (demo) return demo.duration;
    const last = cues.length ? Math.max(...cues.map((c) => c.end)) : 0;
    return Math.max(60000, last + 3000);
  };
  const getTime = () => (hasVideo ? el.video.currentTime * 1000 : clock.t);
  const isPlaying = () => (hasVideo ? !el.video.paused && !el.video.ended : clock.playing);
  function seek(ms) {
    ms = Math.min(Math.max(0, ms), duration() || ms);
    if (hasVideo) el.video.currentTime = ms / 1000;
    else clock.t = ms;
    render(true);
  }
  function play() {
    if (hasVideo) return el.video.play();
    if (clock.t >= duration()) clock.t = 0;
    clock.playing = true;
    clock.last = performance.now();
  }
  function pause() {
    if (hasVideo) el.video.pause();
    else clock.playing = false;
  }
  const togglePlay = () => (isPlaying() ? pause() : play());

  function loop(now) {
    if (!hasVideo && clock.playing) {
      clock.t += (now - clock.last) * parseFloat(el.speed.value);
      clock.last = now;
      if (clock.t >= duration()) { clock.t = duration(); clock.playing = false; }
    }
    render(false);
    requestAnimationFrame(loop);
  }

  // ---------- rendering ----------
  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
  let lastIcon = null;
  const blocks = new Map(); // cue id -> block element on the timeline

  function render(force) {
    const t = getTime(), dur = duration();
    el.time.textContent = mmss(t) + ' / ' + mmss(dur);
    if (document.activeElement !== el.scrub || force) el.scrub.value = dur ? Math.round((t / dur) * 1000) : 0;
    const playing = isPlaying();
    if (playing !== lastIcon) { el.play.innerHTML = playing ? ICON_PAUSE : ICON_PLAY; lastIcon = playing; }
    el.timeline.style.setProperty('--p', dur ? Math.min(1, t / dur) : 0);

    const cue = cues.find((c) => t >= c.start && t < c.end) || null;
    const text = cue ? cue.text : '';
    if (text !== lastCaption) {
      el.caption.innerHTML = captionHTML(text);
      lastCaption = text;
    }
    const id = cue ? cue.id : null;
    if (id !== activeId) {
      if (activeId !== null) {
        if (rows.has(activeId)) rows.get(activeId).classList.remove('active');
        if (blocks.has(activeId)) blocks.get(activeId).classList.remove('active');
      }
      activeId = id;
      if (id !== null && blocks.has(id)) blocks.get(id).classList.add('active');
      const row = id !== null ? rows.get(id) : null;
      if (row) {
        row.classList.add('active');
        if (el.follow.checked && !el.list.contains(document.activeElement)) {
          el.list.scrollTop = row.offsetTop - el.list.clientHeight / 2 + row.clientHeight / 2;
        }
      }
    }
    if (demo) renderDemo(t);
  }

  function renderDemo(t) {
    const truth = demo.truth.find((c) => t >= c.start && t < c.end);
    el.speakerText.textContent = truth ? truth.text : '';
    el.speaker.classList.toggle('on', !!truth);
    if (cues.length === demo.truth.length) {
      const err = cues.reduce((a, c, i) => a + Math.abs(c.start - demo.truth[i].start), 0) / cues.length;
      const ok = err < 200;
      el.badge.hidden = false;
      el.badge.className = 'badge' + (ok ? ' ok' : '');
      el.badge.textContent = ok ? 'In sync ✓' : 'Off by ' + (err / 1000).toFixed(1) + ' s on average';
      if (ok && !demo.wasSynced) { demo.wasSynced = true; toast('🎉 Perfectly synced! Now export it, or open your own video and subtitles.'); }
    } else el.badge.hidden = true;
  }

  const rows = new Map(); // cue id -> row element

  function rowHTML(c, i) {
    return `<div class="cue" data-id="${c.id}">
      <div class="n">${i + 1}</div>
      <div class="times">
        <input class="t-start" value="${S.formatTime(c.start)}" aria-label="Start of line ${i + 1}" spellcheck="false" />
        <span class="sep">→</span>
        <input class="t-end" value="${S.formatTime(c.end)}" aria-label="End of line ${i + 1}" spellcheck="false" />
        <button data-act="setstart" title="Set start to playhead" aria-label="Set start of line ${i + 1} to playhead">⇤</button>
        <button data-act="setend" title="Set end to playhead" aria-label="Set end of line ${i + 1} to playhead">⇥</button>
      </div>
      <textarea rows="2" aria-label="Text of line ${i + 1}">${esc(c.text)}</textarea>
      <div class="side">
        <button class="del" data-act="del" title="Delete line" aria-label="Delete line ${i + 1}">✕</button>
        <button class="del" data-act="merge" title="Merge with next line" aria-label="Merge line ${i + 1} with next">⤓</button>
      </div>
      <div class="issues"></div>
    </div>`;
  }

  function renderList() {
    const q = el.search.value.trim().toLowerCase();
    const keepTop = el.list.scrollTop;
    rows.clear();
    if (!cues.length) {
      el.list.innerHTML = '<div class="none"><p class="eyebrow">How it works</p><ol class="steps"><li><span>Load<small>a video and an .srt / .vtt file, or press Try the demo</small></span></li><li><span>Sync<small>quick shift for a constant delay, two-point sync for drift</small></span></li><li><span>Export<small>download the fixed .srt or .vtt</small></span></li></ol></div>';
    } else {
      const html = [];
      cues.forEach((c, i) => {
        if (!q || c.text.toLowerCase().includes(q)) html.push(rowHTML(c, i));
      });
      el.list.innerHTML = html.join('') || '<div class="none">No lines match your filter.</div>';
      el.list.querySelectorAll('.cue').forEach((r) => rows.set(+r.dataset.id, r));
    }
    el.list.scrollTop = keepTop;
    activeId = null;
    refreshFlags();
    renderMeta();
  }

  // Cheap in-place refresh of the warning flags + QC summary (does not rebuild rows, keeps focus).
  function refreshFlags() {
    const problems = S.analyze(cues);
    let bad = 0;
    cues.forEach((c, i) => {
      const row = rows.get(c.id);
      if (problems[i].length) bad++;
      if (blocks.has(c.id)) blocks.get(c.id).classList.toggle('warn', problems[i].length > 0);
      if (!row) return;
      row.classList.toggle('flag', problems[i].length > 0);
      row.querySelector('.issues').textContent = problems[i].length ? '⚠ ' + problems[i].join(' · ') : '';
    });
    $('qc-summary').textContent = cues.length
      ? bad ? `${bad} of ${cues.length} lines have issues (reading speed, overlaps or very short lines).` : `All ${cues.length} lines look good. ✓`
      : 'Load subtitles to check reading speed, overlaps and very short cues.';
  }

  function updateTimes() {
    cues.forEach((c) => {
      const row = rows.get(c.id);
      if (!row) return;
      row.querySelector('.t-start').value = S.formatTime(c.start);
      row.querySelector('.t-end').value = S.formatTime(c.end);
    });
    refreshFlags();
    renderTimeline();
  }

  function renderMeta() {
    el.count.textContent = cues.length;
    el.fmt.textContent = fmt ? (fmt === 'demo' ? 'Demo' : fmt.toUpperCase()) + ' · ' + cues.length + ' lines' : '—';
    $('a2-cue').max = $('a1-cue').max = Math.max(1, cues.length);
    renderTimeline();
  }

  function renderTimeline() {
    const dur = duration();
    blocks.clear();
    el.laneSpoken.hidden = !demo;
    if (!dur || (!cues.length && !demo)) { el.trackCues.innerHTML = ''; el.trackSpoken.innerHTML = ''; return; }
    const blk = (c) => `<i class="blk" data-id="${c.id}" style="left:${(c.start / dur) * 100}%;width:${Math.max(0.2, ((c.end - c.start) / dur) * 100)}%"></i>`;
    el.trackCues.innerHTML = cues.map(blk).join('');
    el.trackCues.querySelectorAll('.blk').forEach((x) => blocks.set(+x.dataset.id, x));
    el.trackSpoken.innerHTML = demo ? demo.truth.map(blk).join('') : '';
    if (activeId !== null && blocks.has(activeId)) blocks.get(activeId).classList.add('active');
  }

  // ---------- state changes with undo/redo ----------
  function commit(next, opts) {
    past.push(cues);
    if (past.length > 200) past.shift();
    future = [];
    cues = next;
    if (opts && opts.rebuild) renderList(); else updateTimes();
  }
  function restore(from, to) {
    if (!from.length) return false;
    to.push(cues);
    cues = from.pop();
    renderList();
    return true;
  }
  const undo = () => restore(past, future) || toast('Nothing to undo');
  const redo = () => restore(future, past) || toast('Nothing to redo');

  function setCues(list, format, name) {
    cues = list;
    fmt = format;
    if (name) baseName = name;
    past = []; future = []; lastCaption = null;
    el.empty.hidden = list.length > 0;
    $('btn-autofill').hidden = !demo;
    $('a1-cue').value = 1;
    $('a2-cue').value = Math.max(1, list.length);
    $('a1-time').value = ''; $('a2-time').value = '';
    renderList();
    render(true);
  }

  // ---------- loading ----------
  async function decode(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('windows-1252').decode(buf); } // old Latin-1 subtitle files
  }
  async function loadSubs(file) {
    const { cues: list, format } = S.parse(await decode(file));
    if (!list.length) { toast('No subtitle lines found in that file.'); return; }
    demo = null; el.badge.hidden = true; el.speaker.classList.remove('on');
    setCues(list, format, file.name.replace(/\.[^.]+$/, ''));
    toast(`Loaded ${list.length} lines from ${file.name}`);
  }
  function loadVideo(file) {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    el.video.src = videoUrl;
    el.video.hidden = false;
    el.virtual.hidden = true;
    hasVideo = true;
    demo = null; el.badge.hidden = true;
    clock.playing = false;
    if (!cues.length) baseName = file.name.replace(/\.[^.]+$/, '');
    el.video.onloadedmetadata = () => { renderTimeline(); render(true); };
    el.video.onerror = () => toast("This browser can't play that file. Try an MP4 (H.264) or WebM.");
    el.video.playbackRate = parseFloat(el.speed.value);
    toast('Video loaded: ' + file.name);
  }
  function handleFiles(files) {
    [...files].forEach((f) => {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (f.type.startsWith('video/') || f.type.startsWith('audio/') || ['mkv', 'mov', 'mp4', 'webm', 'mp3', 'wav', 'm4a'].includes(ext)) loadVideo(f);
      else if (['srt', 'vtt', 'txt'].includes(ext) || f.type === 'text/vtt') loadSubs(f);
      else toast('Unsupported file: ' + f.name);
    });
  }

  // ---------- demo ----------
  const DEMO_LINES = [
    'Welcome to Subtitle Studio.',
    'Right now these captions are late.',
    'Notice the bubble at the top?',
    'That is what is really being said.',
    'Drag the Quick shift slider to fix it.',
    'Or use the playhead for a two-point sync.',
    'Everything runs in your browser.',
    'Your files are never uploaded.',
    'When the badge turns green, you are done.',
    'Export as SRT or VTT. Happy captioning!',
  ];
  function loadDemo(kind) {
    if (hasVideo) { el.video.pause(); el.video.removeAttribute('src'); el.video.hidden = true; el.video.load(); hasVideo = false; }
    el.virtual.hidden = false;
    el.empty.hidden = true;
    const truth = DEMO_LINES.map((text, i) => ({ id: 1000 + i, start: 1500 + i * 4200, end: 1500 + i * 4200 + 3000, text }));
    const bad = kind === 'drift'
      ? truth.map((c) => ({ ...c, start: Math.round(c.start * 1.04 + 1500), end: Math.round(c.end * 1.04 + 1500) }))
      : S.shift(truth, 2500);
    demo = { truth, duration: 46000, wasSynced: false, kind };
    clock.t = 0; clock.playing = false;
    setCues(bad.map((c, i) => ({ ...c, id: i + 1 })), 'demo', 'demo');
    $('btn-autofill').hidden = false;
    document.querySelector('#t-sync').click();
    toast(kind === 'drift'
      ? 'Late AND drifting. Press ▶, then use Two-point sync (try "Autofill the answers").'
      : 'The captions are 2.5 s late. Press ▶, then drag Quick shift to −2.5 s.');
    play();
  }

  // ---------- export ----------
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function doExport(kind) {
    if (!cues.length) { toast('Nothing to export yet.'); return; }
    if (kind === 'srt') download(baseName + '.srt', S.toSRT(cues), 'application/x-subrip');
    else if (kind === 'vtt') download(baseName + '.vtt', S.toVTT(cues), 'text/vtt');
    else if (kind === 'txt') download(baseName + '.txt', S.toTXT(cues), 'text/plain');
    else if (kind === 'copy') {
      try { await navigator.clipboard.writeText(S.toSRT(cues)); toast('Copied SRT to clipboard'); }
      catch (e) { toast('Clipboard blocked by the browser. Use Download instead.'); }
      return;
    }
    toast('Exported ' + kind.toUpperCase());
  }

  // ---------- list editing (event delegation) ----------
  const rowOf = (target) => target.closest('.cue');
  const cueById = (id) => cues.find((c) => c.id === id);

  el.list.addEventListener('click', (e) => {
    const row = rowOf(e.target);
    if (!row) return;
    const id = +row.dataset.id, c = cueById(id);
    const act = e.target.dataset && e.target.dataset.act;
    if (act === 'del') { commit(cues.filter((x) => x.id !== id), { rebuild: true }); return; }
    if (act === 'merge') {
      const i = cues.findIndex((x) => x.id === id), n = cues[i + 1];
      if (!n) { toast('This is the last line.'); return; }
      const merged = { ...c, end: Math.max(c.end, n.end), text: (c.text + '\n' + n.text).trim() };
      commit(cues.flatMap((x) => (x.id === id ? [merged] : x.id === n.id ? [] : [x])), { rebuild: true });
      return;
    }
    if (act === 'setstart' || act === 'setend') {
      const t = Math.round(getTime());
      commit(cues.map((x) => (x.id === id ? { ...x, [act === 'setstart' ? 'start' : 'end']: t } : x)));
      return;
    }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    seek(c.start + 10);
  });

  el.list.addEventListener('change', (e) => {
    const row = rowOf(e.target);
    if (!row) return;
    const id = +row.dataset.id, c = cueById(id);
    if (e.target.tagName === 'TEXTAREA') {
      if (e.target.value !== c.text) { commit(cues.map((x) => (x.id === id ? { ...x, text: e.target.value } : x))); lastCaption = null; }
      return;
    }
    const isStart = e.target.classList.contains('t-start');
    const v = S.parseTime(e.target.value);
    e.target.classList.toggle('bad', v === null);
    if (v === null) { toast('Use the format 00:00:00,000'); return; }
    const key = isStart ? 'start' : 'end';
    if (v === c[key]) { e.target.value = S.formatTime(v); return; }
    const next = cues.map((x) => (x.id === id ? { ...x, [key]: v } : x));
    const sorted = next.slice().sort((a, b) => a.start - b.start);
    const reordered = sorted.some((x, i) => x.id !== next[i].id);
    commit(reordered ? sorted : next, { rebuild: reordered });
  });

  // ---------- sync tools ----------
  const range = $('shift-range'), out = $('shift-out');
  range.addEventListener('input', () => {
    if (!cues.length) { range.value = 0; return; }
    if (!shiftBase) shiftBase = cues;
    const v = parseFloat(range.value);
    out.textContent = (v > 0 ? '+' : '') + v.toFixed(1) + ' s';
    cues = S.shift(shiftBase, v * 1000);
    updateTimes();
  });
  range.addEventListener('change', () => {
    if (shiftBase) {
      if (parseFloat(range.value) !== 0) { past.push(shiftBase); future = []; } else cues = shiftBase;
    }
    shiftBase = null; range.value = 0; out.textContent = '0.0 s';
  });
  const nudge = (ms) => { if (cues.length) commit(S.shift(cues, ms)); };
  document.querySelectorAll('[data-nudge]').forEach((b) => b.addEventListener('click', () => nudge(+b.dataset.nudge)));

  document.querySelectorAll('[data-playhead]').forEach((b) => b.addEventListener('click', () => { $(b.dataset.playhead).value = S.formatTime(getTime()); }));

  $('btn-linear').addEventListener('click', () => {
    const msg = $('linear-msg');
    const fail = (t) => { msg.className = 'msg err'; msg.textContent = t; };
    const i1 = parseInt($('a1-cue').value, 10) - 1, i2 = parseInt($('a2-cue').value, 10) - 1;
    const b1 = S.parseTime($('a1-time').value), b2 = S.parseTime($('a2-time').value);
    if (!cues.length) return fail('Load subtitles first.');
    if (!(i1 >= 0 && i1 < cues.length && i2 >= 0 && i2 < cues.length)) return fail('Line numbers must be between 1 and ' + cues.length + '.');
    if (i1 === i2) return fail('Pick two different lines.');
    if (b1 === null || b2 === null) return fail('Enter both times as 00:00:00,000 (or press Use playhead).');
    if (b1 === b2) return fail('The two times must differ.');
    const factor = (b2 - b1) / (cues[i2].start - cues[i1].start); // measure BEFORE applying
    commit(S.linearSync(cues, cues[i1].start, b1, cues[i2].start, b2));
    msg.className = 'msg';
    msg.textContent = 'Done. Timing scaled ×' + factor.toFixed(4);
  });

  $('btn-autofill').addEventListener('click', () => {
    if (!demo) return;
    const i1 = parseInt($('a1-cue').value, 10) - 1, i2 = parseInt($('a2-cue').value, 10) - 1;
    if (!demo.truth[i1] || !demo.truth[i2]) return;
    $('a1-time').value = S.formatTime(demo.truth[i1].start);
    $('a2-time').value = S.formatTime(demo.truth[i2].start);
  });
  $('btn-demo-drift').addEventListener('click', () => loadDemo('drift'));

  // ---------- clean-up tools ----------
  $('btn-replace').addEventListener('click', () => {
    const r = S.findReplace(cues, $('fr-find').value, $('fr-repl').value, { matchCase: $('fr-case').checked });
    $('fr-msg').textContent = r.count ? `Replaced ${r.count}` : 'No matches';
    if (r.count) { commit(r.cues, { rebuild: true }); lastCaption = null; }
  });
  $('btn-fix-overlap').addEventListener('click', () => {
    if (!cues.length) return;
    commit(S.fixOverlaps(cues));
    toast('Overlaps trimmed');
  });
  $('btn-next-issue').addEventListener('click', () => {
    const problems = S.analyze(cues), t = getTime();
    let i = cues.findIndex((c, k) => problems[k].length && c.start > t + 50);
    if (i < 0) i = problems.findIndex((p) => p.length);
    if (i < 0) { toast('No issues found 🎉'); return; }
    seek(cues[i].start + 10);
    const row = rows.get(cues[i].id);
    if (row) el.list.scrollTop = row.offsetTop - el.list.clientHeight / 2;
  });
  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);

  $('btn-add').addEventListener('click', () => {
    const t = Math.round(getTime());
    const id = Math.max(0, ...cues.map((c) => c.id)) + 1;
    const next = cues.concat({ id, start: t, end: t + 2000, text: 'New line' }).sort((a, b) => a.start - b.start);
    if (!fmt) fmt = 'srt';
    commit(next, { rebuild: true });
    const row = rows.get(id);
    if (row) { el.list.scrollTop = row.offsetTop - 60; row.querySelector('textarea').select(); }
  });
  el.search.addEventListener('input', renderList);

  // ---------- transport ----------
  el.play.addEventListener('click', togglePlay);
  el.scrub.addEventListener('input', () => seek((el.scrub.value / 1000) * duration()));
  el.speed.addEventListener('change', () => { if (hasVideo) el.video.playbackRate = parseFloat(el.speed.value); });
  el.stage.addEventListener('click', (e) => { if (!e.target.closest('.empty')) togglePlay(); });
  el.timeline.addEventListener('click', (e) => {
    const r = el.trackCues.getBoundingClientRect();
    if (r.width) seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * duration());
  });
  $('hero-demo').addEventListener('click', () => loadDemo('offset'));
  el.video.addEventListener('timeupdate', () => render(false));

  // ---------- caption style (preview only) ----------
  function applyStyle() {
    const size = +$('st-size').value, bg = +$('st-bg').value / 100, pos = +$('st-pos').value;
    el.caption.style.fontSize = (size * el.stage.clientWidth) / 800 + 'px';
    el.caption.style.background = `rgba(0,0,0,${bg})`;
    el.caption.style.bottom = pos + '%';
    el.caption.style.color = $('st-color').value;
    store.set('ss-style', JSON.stringify({ s: size, b: +$('st-bg').value, p: pos, c: $('st-color').value }));
  }
  ['st-size', 'st-bg', 'st-pos', 'st-color'].forEach((id) => $(id).addEventListener('input', applyStyle));
  new ResizeObserver(applyStyle).observe(el.stage);
  try {
    const s = JSON.parse(store.get('ss-style') || 'null');
    if (s) { $('st-size').value = s.s; $('st-bg').value = s.b; $('st-pos').value = s.p; $('st-color').value = s.c; }
  } catch (e) { /* ignore corrupt value */ }

  // ---------- tabs ----------
  const tabs = [...document.querySelectorAll('[role=tab]')];
  function selectTab(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(n); n.focus();
    });
  });

  // ---------- header: files, export menu, theme ----------
  $('file-video').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
  $('file-subs').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
  $('btn-demo').addEventListener('click', () => loadDemo('offset'));

  const pop = $('export-pop'), expBtn = $('btn-export');
  const setPop = (open) => { pop.hidden = !open; expBtn.setAttribute('aria-expanded', open); };
  expBtn.addEventListener('click', (e) => { e.stopPropagation(); setPop(pop.hidden); });
  pop.addEventListener('click', (e) => { const k = e.target.dataset.export; if (k) { doExport(k); setPop(false); } });
  document.addEventListener('click', () => setPop(false));

  const root = document.documentElement;
  root.dataset.theme = store.get('ss-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  $('btn-theme').addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    store.set('ss-theme', root.dataset.theme);
  });

  // ---------- drag & drop anywhere ----------
  const dz = $('dropzone');
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; dz.hidden = false; } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dz.hidden = true; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; dz.hidden = true; if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    const typing = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); doExport('srt'); return; }
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowLeft' && tag !== 'INPUT') { e.preventDefault(); seek(getTime() - (e.shiftKey ? 10000 : 2000)); }
    else if (e.key === 'ArrowRight' && tag !== 'INPUT') { e.preventDefault(); seek(getTime() + (e.shiftKey ? 10000 : 2000)); }
    else if (e.key === '[') nudge(-100);
    else if (e.key === ']') nudge(100);
  });

  // ---------- go ----------
  window.addEventListener('beforeunload', (e) => { if (past.length) { e.preventDefault(); e.returnValue = ''; } });
  renderList();
  applyStyle();
  requestAnimationFrame(loop);

  // tiny hook for automated tests
  window.__studio = { get cues() { return cues; }, loadDemo, seek, getTime };
})();

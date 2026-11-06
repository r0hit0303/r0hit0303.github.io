(() => {
  'use strict';

  const DOCS_BASE = 'https://github.com/brave/brave-core/blob/master/docs/best-practices/';
  const STORE_KEY = 'bpdojo.v1';
  const DAY = 24 * 60 * 60 * 1000;
  // Leitner box -> delay before the rule is due again.
  const INTERVALS = [0, 10 * 60 * 1000, DAY, 3 * DAY, 7 * DAY, 21 * DAY];
  const MASTERED_BOX = 4;
  const SESSION_SIZE = 12;
  const NEW_PER_SESSION = 6;
  const LIGHTNING_SECONDS = 60;
  const LEVELS = ['Intern', 'Contributor', 'Reviewer', 'Senior Reviewer', 'Staff Engineer',
    'Principal', 'OWNERS file', 'Upstream Whisperer', 'Lion of brave-core'];

  const RULES = window.BP_RULES || [];
  const QUESTIONS = window.BP_QUESTIONS || [];
  const ruleById = new Map(RULES.map((r) => [r.id, r]));
  const questionsByRule = new Map();
  for (const q of QUESTIONS) {
    if (!ruleById.has(q.rule)) continue;
    if (!questionsByRule.has(q.rule)) questionsByRule.set(q.rule, []);
    questionsByRule.get(q.rule).push(q);
  }
  const DOCS = [];
  for (const r of RULES) {
    let d = DOCS.find((x) => x.doc === r.doc);
    if (!d) DOCS.push(d = { doc: r.doc, title: r.docTitle, rules: [] });
    d.rules.push(r);
  }

  // ---------- persistence ----------

  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && s.rules) return s;
    } catch (e) { /* ignore corrupt state */ }
    return { rules: {}, xp: 0, streak: { last: null, count: 0 }, best: { lightning: 0 }, off: [] };
  }
  const state = loadState();
  const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(state));
  const progressOf = (id) => state.rules[id] || { box: 0, due: 0, seen: 0, right: 0 };

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function touchStreak() {
    const t = today();
    if (state.streak.last === t) return;
    const y = new Date(Date.now() - DAY);
    const yesterday = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
    state.streak.count = state.streak.last === yesterday ? state.streak.count + 1 : 1;
    state.streak.last = t;
  }

  function levelInfo(xp) {
    const lvl = Math.floor(Math.sqrt(xp / 40));
    const cur = 40 * lvl * lvl;
    const next = 40 * (lvl + 1) * (lvl + 1);
    return { lvl, name: LEVELS[Math.min(lvl, LEVELS.length - 1)], pct: (xp - cur) / (next - cur), next };
  }

  function grade(rule, correct, strength = 1) {
    const p = progressOf(rule.id);
    p.seen++;
    if (correct) {
      p.right++;
      p.box = Math.min(INTERVALS.length - 1, p.box + strength);
    } else {
      p.box = 1;
    }
    p.due = Date.now() + INTERVALS[p.box];
    state.rules[rule.id] = p;
    touchStreak();
    save();
  }

  function addXp(n) {
    const before = levelInfo(state.xp).lvl;
    state.xp = Math.max(0, state.xp + n);
    const after = levelInfo(state.xp);
    save();
    if (after.lvl > before) toast(`Level up! You're now a ${after.name} 🎉`);
    renderStats();
  }

  // ---------- helpers ----------

  const $ = (sel, root = document) => root.querySelector(sel);
  const app = $('#app');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function resolveLink(url) {
    if (/^[a-z]+:/i.test(url) || url.startsWith('#')) return url;
    return DOCS_BASE + url.replace(/^\.\//, '');
  }

  function inline(text) {
    const codes = [];
    const withTokens = String(text).replace(/`([^`]+)`/g, (m, code) => {
      codes.push(`<code>${esc(code)}</code>`);
      return `\u0000${codes.length - 1}\u0000`;
    });
    return esc(withTokens)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) =>
        `<a href="${esc(resolveLink(url.replace(/&amp;/g, '&')))}" target="_blank" rel="noopener">${label}</a>`)
      .replace(/\u0000(\d+)\u0000/g, (m, i) => codes[Number(i)]);
  }

  function md(src) {
    const lines = String(src).replace(/<a id="[^"]*"><\/a>/g, '').split('\n');
    const out = [];
    let para = [];
    let list = null;
    const flushPara = () => {
      if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    };
    const flushList = () => {
      if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
      list = null;
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fence = line.match(/^\s*```(\S*)/);
      if (fence) {
        flushPara(); flushList();
        const code = [];
        while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
        out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
        continue;
      }
      if (/^\s*\|/.test(line)) {
        flushPara(); flushList();
        const rows = [];
        for (; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(lines[i]);
        i--;
        const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const body = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
        out.push('<table>' + body.map((r, n) => '<tr>' + cells(r).map((c) =>
          n === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</table>');
        continue;
      }
      const heading = line.match(/^#{1,6}\s+(.*)/);
      if (heading) { flushPara(); flushList(); out.push(`<h4>${inline(heading[1])}</h4>`); continue; }
      const li = line.match(/^\s*(?:([-*])|(\d+)\.)\s+(.*)/);
      if (li) {
        flushPara();
        const tag = li[1] ? 'ul' : 'ol';
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push(li[3]);
        continue;
      }
      if (/^\s*>/.test(line)) { flushPara(); flushList(); out.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`); continue; }
      if (!line.trim() || line.trim() === '---') { flushPara(); flushList(); continue; }
      if (list && /^\s{2,}\S/.test(line)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
      flushList();
      para.push(line.trim());
    }
    flushPara(); flushList();
    return out.join('\n');
  }

  // Strip the ❌/✅ labels from doc snippets so they don't give the answer away.
  function stripMarkers(code) {
    const lines = code.split('\n').map((line) => {
      const t = line.trim();
      if (/^(\/\/|#|<!--|\/\*|\*)\s*(❌|✅)/.test(t)) return null;
      if (/^(❌|✅)/.test(t)) return line.replace(/(❌|✅)\s*(WRONG|CORRECT|BAD|GOOD)?\s*[:-]?\s*/, '');
      return line.replace(/\s*(\/\/|#)\s*(❌|✅).*$/, '');
    }).filter((l) => l !== null);
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
    return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join('\n');
  }

  function markerNote(code) {
    const first = code.split('\n').find((l) => /(❌|✅)/.test(l)) || '';
    return first.replace(/^.*?(❌|✅)\s*(WRONG|CORRECT|BAD|GOOD)?\s*[:-]?\s*/, '').replace(/-->\s*$/, '').trim();
  }

  // ---------- card builders ----------

  function spotPair(rule) {
    if (!rule.wrong.length || !rule.right.length) return null;
    const i = Math.floor(Math.random() * Math.min(rule.wrong.length, rule.right.length));
    const wrong = stripMarkers(rule.wrong[i]);
    const right = stripMarkers(rule.right[i]);
    if (!wrong || !right || wrong === right) return null;
    return { wrong, right, wrongNote: markerNote(rule.wrong[i]), rightNote: markerNote(rule.right[i]) };
  }

  function buildCard(rule, allowed = ['mcq', 'spot', 'flash']) {
    const qs = questionsByRule.get(rule.id) || [];
    const pair = allowed.includes('spot') ? spotPair(rule) : null;
    const options = [];
    if (allowed.includes('mcq') && qs.length) options.push('mcq', 'mcq');
    if (pair) options.push('spot');
    if (!options.length && allowed.includes('flash')) options.push('flash');
    if (!options.length) return null;
    const type = pick(options);
    if (type === 'mcq') {
      const q = pick(qs);
      const order = shuffle(q.choices.map((c, i) => i));
      return { type, rule, prompt: q.prompt, explain: q.explain,
        choices: order.map((i) => q.choices[i]), answer: order.indexOf(q.answer) };
    }
    if (type === 'spot') {
      const flip = Math.random() < 0.5;
      return { type, rule, pair, choices: flip ? [pair.right, pair.wrong] : [pair.wrong, pair.right],
        answer: flip ? 0 : 1 };
    }
    return { type: 'flash', rule };
  }

  // When set, every mode is restricted to this doc's rules (single-track practice).
  let scope = null;
  const docInfo = (doc) => DOCS.find((d) => d.doc === doc);
  const activeRules = () => scope ? docInfo(scope).rules : RULES.filter((r) => !state.off.includes(r.doc));
  const bestKey = () => scope ? `lightning:${scope}` : 'lightning';

  function dueRules() {
    const now = Date.now();
    return activeRules().filter((r) => { const p = progressOf(r.id); return p.box > 0 && p.due <= now; });
  }

  function reviewDeck(size = SESSION_SIZE) {
    const due = shuffle(dueRules()).sort((a, b) => progressOf(a.id).box - progressOf(b.id).box);
    const fresh = activeRules().filter((r) => progressOf(r.id).box === 0 && !progressOf(r.id).seen);
    const deck = due.slice(0, size);
    const newOnes = shuffle(fresh).slice(0, Math.max(NEW_PER_SESSION, size - deck.length));
    return shuffle(deck.concat(newOnes).slice(0, size));
  }

  // ---------- session ----------

  let session = null;

  function startSession(mode, rules) {
    let deck;
    if (mode === 'review') deck = rules || reviewDeck();
    else if (mode === 'spot') deck = shuffle(activeRules().filter((r) => spotPair(r))).slice(0, SESSION_SIZE);
    else if (mode === 'flash') deck = rules || shuffle(activeRules()).slice(0, SESSION_SIZE);
    else if (mode === 'lightning') deck = shuffle(activeRules());
    if (!deck || !deck.length) {
      toast(scope ? 'Nothing to play in this mode for this track.' : 'Nothing to play — enable more docs.');
      return;
    }
    const allowed = { review: ['mcq', 'spot', 'flash'], spot: ['spot'], flash: ['flash'], lightning: ['mcq', 'spot'] }[mode];
    session = { mode, deck, allowed, i: 0, right: 0, wrong: [], combo: 0, bestCombo: 0, xp: 0, card: null, answered: false };
    if (mode === 'lightning') {
      session.timeLeft = LIGHTNING_SECONDS;
      session.timer = setInterval(tickLightning, 1000);
    }
    nextCard();
  }

  function nextCard() {
    while (session.i < session.deck.length) {
      const card = buildCard(session.deck[session.i], session.allowed);
      if (card) { session.card = card; session.answered = false; renderCard(); return; }
      session.i++;
    }
    endSession();
  }

  function tickLightning() {
    session.timeLeft--;
    const t = $('.timer');
    if (t) { t.textContent = `${session.timeLeft}s`; t.classList.toggle('low', session.timeLeft <= 10); }
    if (session.timeLeft <= 0) endSession();
  }

  function answer(idx) {
    const s = session;
    if (!s || s.answered || !s.card || s.card.type === 'flash') return;
    s.answered = true;
    const correct = idx === s.card.answer;
    grade(s.card.rule, correct);
    if (correct) {
      s.right++;
      s.combo++;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      const gained = 10 + Math.min(s.combo - 1, 5) * 2;
      s.xp += gained;
      addXp(gained);
    } else {
      s.combo = 0;
      s.wrong.push(s.card.rule);
      if (s.mode === 'lightning') s.timeLeft = Math.max(1, s.timeLeft - 5);
    }
    if (s.mode === 'lightning') {
      s.i++;
      if (!correct) {
        const panel = $('.panel');
        panel.classList.add('shake');
      }
      setTimeout(() => { if (session === s && s.timeLeft > 0) nextCard(); }, correct ? 250 : 900);
      markChoices(idx);
      return;
    }
    markChoices(idx);
    renderFeedback(correct);
  }

  function markChoices(idx) {
    const c = session.card;
    document.querySelectorAll('.choice').forEach((el, i) => {
      el.disabled = true;
      if (i === c.answer) el.classList.add('correct');
      else if (i === idx) el.classList.add('wrong');
      else el.classList.add('dim');
    });
  }

  function gradeFlash(level) {
    const s = session;
    if (!s.answered) return;
    const correct = level > 0;
    grade(s.card.rule, correct, level === 2 ? 2 : 1);
    if (correct) { s.right++; s.xp += 4 * level; addXp(4 * level); } else s.wrong.push(s.card.rule);
    advance();
  }

  function advance() {
    if (!session) return;
    session.i++;
    nextCard();
  }

  function endSession() {
    const s = session;
    if (!s) return;
    clearInterval(s.timer);
    let record = false;
    if (s.mode === 'lightning' && s.right > (state.best[bestKey()] || 0)) {
      state.best[bestKey()] = s.right;
      record = true;
      save();
    }
    session = null;
    renderSummary(s, record);
  }

  // ---------- rendering ----------

  function renderStats() {
    const li = levelInfo(state.xp);
    const mastered = RULES.filter((r) => progressOf(r.id).box >= MASTERED_BOX).length;
    $('#stats').innerHTML = `
      <span title="Level">🎖️ <b>${esc(li.name)}</b> (L${li.lvl + 1})</span>
      <span title="Experience">⭐ <b>${state.xp}</b> / ${li.next} XP</span>
      <span title="Daily streak">🔥 <b>${state.streak.count}</b> day${state.streak.count === 1 ? '' : 's'}</span>
      <span title="Rules mastered">🧠 <b>${mastered}</b>/${RULES.length}</span>`;
  }

  function kindLabel(rule) {
    if (rule.kind === 'do') return '<span class="kind-do">✅ DO</span>';
    if (rule.kind === 'dont') return '<span class="kind-dont">❌ DON\'T</span>';
    return '<span class="kind-info">ℹ️ GUIDE</span>';
  }

  function ruleBlock(rule, { full = false } = {}) {
    return `
      <div class="hint">${esc(rule.docTitle)}${rule.group ? ' › ' + esc(rule.group) : ''} · ${esc(rule.id)}</div>
      <div><strong>${kindLabel(rule)} ${inline(rule.title)}</strong></div>
      ${full ? md(rule.body) : (rule.summary && !rule.summary.endsWith(':') ? `<p>${inline(rule.summary)}</p>` : '')}
      <a href="${esc(rule.url)}" target="_blank" rel="noopener">Read the full rule in brave-core ↗</a>`;
  }

  function modesHtml() {
    const due = dueRules().length;
    const unseen = activeRules().filter((r) => !progressOf(r.id).seen).length;
    const spotCount = activeRules().filter((r) => r.wrong.length && r.right.length).length;
    return `<div class="modes">
        <button class="mode" data-start="review">
          <span class="pill ${due ? 'hot' : ''}">${due ? due + ' due' : unseen + ' new'}</span>
          <div class="icon">🧑‍⚖️</div><h3>${scope ? 'Practice' : 'Daily Review'}</h3>
          <p>Spaced-repetition mix of code-review scenarios and spot-the-bug. Best for long-term memory.</p>
        </button>
        <button class="mode" data-start="spot" ${spotCount ? '' : 'disabled'}>
          <span class="pill">${spotCount}</span>
          <div class="icon">🔍</div><h3>Spot the Bug</h3>
          <p>${spotCount ? 'Two snippets straight from the docs. Pick the one that passes review.' : 'This track has no wrong/correct code pairs.'}</p>
        </button>
        <button class="mode" data-start="lightning">
          <span class="pill">best ${state.best[bestKey()] || 0}</span>
          <div class="icon">⚡</div><h3>Lightning Round</h3>
          <p>${LIGHTNING_SECONDS} seconds. Combos multiply XP; a miss costs 5 seconds.</p>
        </button>
        <button class="mode" data-start="flash">
          <div class="icon">🃏</div><h3>Recall Cards</h3>
          <p>See the rule title, explain it to yourself, then reveal and grade honestly.</p>
        </button>
        <button class="mode" data-action="rulebook">
          <div class="icon">📖</div><h3>Rulebook</h3>
          <p>Browse and search ${scope ? 'this track\'s' : 'every'} rule${scope ? 's' : ''} with your mastery level.</p>
        </button>
      </div>`;
  }

  function trackCounts(rules) {
    const boxes = rules.map((r) => progressOf(r.id).box);
    return {
      n: rules.length,
      mastered: boxes.filter((b) => b >= MASTERED_BOX).length,
      learning: boxes.filter((b) => b > 0 && b < MASTERED_BOX).length,
    };
  }

  function stopSession() {
    if (session) clearInterval(session.timer);
    session = null;
  }

  function goBack() {
    if (scope) renderTrack(scope); else renderHome();
  }

  function renderHome() {
    stopSession();
    scope = null;
    app.dataset.view = 'home';
    renderStats();
    const docsHtml = DOCS.map((d) => {
      const { n, mastered: m, learning: l } = trackCounts(d.rules);
      const on = !state.off.includes(d.doc);
      return `<div class="doc ${on ? '' : 'off'}" data-track="${esc(d.doc)}" role="button" tabindex="0"
        aria-label="Practice ${esc(d.title)}" title="Practice this track">
        <div class="row"><span class="name">${esc(d.title)}</span>
          <button class="incl ${on ? 'on' : ''}" data-toggle="${esc(d.doc)}"
            title="${on ? 'Included in' : 'Excluded from'} mixed modes — click to ${on ? 'exclude' : 'include'}">${on ? '✓' : ''}</button></div>
        <div class="row"><div class="bar" style="flex:1"><span class="m" style="width:${100 * m / n}%"></span><span class="l" style="width:${100 * l / n}%"></span></div>
          <span class="count">${m}/${n}</span></div>
      </div>`;
    }).join('');

    app.innerHTML = `
      <h1>Brave Code Review Dojo</h1>
      <p class="sub">Learn the ${RULES.length} brave-core best practices by reviewing code. Rules you miss come back sooner; rules you know get spaced out until they stick.</p>
      ${modesHtml()}
      <h2>Tracks <span class="hint">— click a track to practice just that area · the checkbox includes it in the mixed modes above · green = mastered, yellow = learning</span></h2>
      <div class="toolbar">
        <button class="btn small" data-action="all-on">Include all</button>
        <button class="btn small" data-action="all-off">Include none</button>
        <button class="btn small" data-action="reset" style="margin-left:auto">Reset progress</button>
      </div>
      <div class="docs">${docsHtml}</div>
      <p class="hint" style="margin-top:24px">Keyboard: <code>1</code>–<code>4</code> answer, <code>Enter</code> next, <code>Space</code> reveal on cards, <code>Esc</code> back.</p>`;
  }

  function renderTrack(doc) {
    stopSession();
    scope = doc;
    app.dataset.view = 'track';
    window.scrollTo(0, 0);
    renderStats();
    const d = docInfo(doc);
    const { n, mastered, learning } = trackCounts(d.rules);
    const due = dueRules().length;
    const docUrl = d.rules[0].url.replace(/#.*$/, '');
    app.innerHTML = `
      <p><a href="#" data-action="home">← All tracks</a></p>
      <h1>${esc(d.title)}</h1>
      <p class="sub">${n} rules · <a href="${esc(docUrl)}" target="_blank" rel="noopener">read the doc ↗</a></p>
      <div class="statgrid">
        <div class="stat"><div class="v">${mastered}</div><div class="k">mastered</div></div>
        <div class="stat"><div class="v">${learning}</div><div class="k">learning</div></div>
        <div class="stat"><div class="v">${n - mastered - learning}</div><div class="k">not started</div></div>
        <div class="stat"><div class="v">${due}</div><div class="k">due now</div></div>
      </div>
      <div class="bar" style="height:8px;margin-bottom:20px"><span class="m" style="width:${100 * mastered / n}%"></span><span class="l" style="width:${100 * learning / n}%"></span></div>
      ${modesHtml()}`;
  }

  function sessionHeader() {
    const s = session;
    const titles = { review: scope ? '🧑‍⚖️ Practice' : '🧑‍⚖️ Daily Review', spot: '🔍 Spot the Bug', flash: '🃏 Recall Cards', lightning: '⚡ Lightning Round' };
    const title = titles[s.mode] + (scope ? ` · ${esc(docInfo(scope).title)}` : '');
    const back = `<p class="backlink"><a href="#" data-action="back">← Back to ${scope ? esc(docInfo(scope).title) : 'home'}</a></p>`;
    if (s.mode === 'lightning') {
      return `${back}<div class="progress"><span>${title}</span>
        <span class="combo">${s.combo > 1 ? `🔥 x${s.combo}` : ''}</span>
        <span>Score <b>${s.right}</b></span><span class="timer ${s.timeLeft <= 10 ? 'low' : ''}">${s.timeLeft}s</span></div>`;
    }
    return `${back}<div class="progress"><span>${title}</span>
      <div class="bar"><span style="width:${100 * s.i / s.deck.length}%"></span></div>
      <span>${s.i + 1}/${s.deck.length}</span><span class="combo">${s.combo > 1 ? `🔥 x${s.combo}` : ''}</span>
      <button class="btn small" data-action="end" title="Stop now and see your results">Finish</button></div>`;
  }

  function cardMeta(rule) {
    const p = progressOf(rule.id);
    const status = !p.seen ? '<span class="pill hot">NEW</span>' :
      p.box >= MASTERED_BOX ? '<span class="pill">mastered</span>' : `<span class="pill">box ${p.box}</span>`;
    return `<div class="card-meta"><span class="pill">${esc(rule.docTitle)}</span>${status}</div>`;
  }

  function renderCard() {
    const c = session.card;
    let body;
    if (c.type === 'mcq') {
      body = `<div class="prompt">${md(c.prompt)}</div>
        <div class="choices">${c.choices.map((ch, i) => `
          <button class="choice" data-choice="${i}"><span class="key">${i + 1}</span><span class="body">${inline(ch)}</span></button>`).join('')}
        </div>`;
    } else if (c.type === 'spot') {
      body = `<div class="prompt"><p><strong>Which one passes code review?</strong></p>
        <p class="hint">Topic: ${esc(c.rule.group || c.rule.docTitle)}</p></div>
        <div class="spot">${c.choices.map((code, i) => `
          <button class="choice" data-choice="${i}"><span class="key">${i + 1}</span><pre><code>${esc(code)}</code></pre></button>`).join('')}
        </div>`;
    } else {
      body = `<div class="flash-title">${kindLabel(c.rule)} ${inline(c.rule.title)}</div>
        <p class="hint">Before revealing: what's the rule, why does it exist, and what does the fix look like?</p>
        <div id="reveal"><button class="btn primary" data-action="reveal">Reveal (Space)</button></div>`;
    }
    app.dataset.view = 'session';
    window.scrollTo(0, 0);
    app.innerHTML = `${sessionHeader()}<div class="panel">${cardMeta(c.rule)}${body}<div id="fb"></div></div>`;
  }

  function renderFeedback(correct) {
    const c = session.card;
    let detail = '';
    if (c.type === 'mcq') detail = `<p>${inline(c.explain)}</p>`;
    if (c.type === 'spot') {
      const notes = [c.pair.wrongNote && `❌ ${c.pair.wrongNote}`, c.pair.rightNote && `✅ ${c.pair.rightNote}`].filter(Boolean);
      detail = notes.length ? `<p>${notes.map(inline).join('<br>')}</p>` : '';
    }
    const praise = pick(['LGTM! 👍', 'Approved ✅', 'Ship it 🚀', 'Nice catch 🦁', 'Reviewer energy ⚡']);
    const scold = pick(['Changes requested 🔁', 'Nit: not quite 🧐', 'This would get flagged 🚩']);
    $('#fb').innerHTML = `<div class="feedback ${correct ? 'good' : 'bad'}">
      <h4>${correct ? praise : scold}</h4>${detail}
      <div class="rule">${ruleBlock(c.rule)}</div>
      <div class="actions"><button class="btn primary" data-action="next">Next (Enter)</button>
      <button class="btn small" data-action="more">Show full rule</button></div></div>`;
    $('#fb').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function revealFlash() {
    if (!session || session.card.type !== 'flash' || session.answered) return;
    session.answered = true;
    const r = session.card.rule;
    $('#reveal').innerHTML = `<div class="feedback">${ruleBlock(r, { full: true })}
      <div class="grade">
        <button class="btn" data-grade="0">1 · Forgot</button>
        <button class="btn" data-grade="1">2 · Got it</button>
        <button class="btn" data-grade="2">3 · Easy</button>
      </div></div>`;
  }

  function renderSummary(s, record) {
    renderStats();
    const total = s.mode === 'lightning' ? s.right + s.wrong.length : Math.min(s.i, s.deck.length);
    const acc = total ? Math.round(100 * s.right / total) : 0;
    const missed = [...new Map(s.wrong.map((r) => [r.id, r])).values()];
    app.dataset.view = 'summary';
    window.scrollTo(0, 0);
    app.innerHTML = `<div class="panel">
      <h1>${s.mode === 'lightning' ? (record ? '🏆 New record!' : '⚡ Time!') : acc >= 80 ? '🏆 Great review session' : '📚 Session complete'}</h1>
      <div class="statgrid">
        <div class="stat"><div class="v">${s.right}/${total}</div><div class="k">correct</div></div>
        <div class="stat"><div class="v">${acc}%</div><div class="k">accuracy</div></div>
        <div class="stat"><div class="v">${s.bestCombo}</div><div class="k">best combo</div></div>
        <div class="stat"><div class="v">+${s.xp}</div><div class="k">XP</div></div>
      </div>
      ${missed.length ? `<h2>Rules to revisit</h2><div class="rulelist">${missed.map((r) => `
        <details class="ruleitem"><summary><span class="rid">${esc(r.id)}</span><span class="rt">${kindLabel(r)} ${inline(r.title)}</span></summary>
        <div class="content">${ruleBlock(r, { full: true })}</div></details>`).join('')}</div>` : '<p>No misses. Those rules are now scheduled further out.</p>'}
      <div class="toolbar" style="margin-top:18px">
        ${missed.length ? '<button class="btn primary" data-action="retry">Drill the misses</button>' : ''}
        <button class="btn ${missed.length ? '' : 'primary'}" data-start="${s.mode}">Play again</button>
        <button class="btn" data-action="back">${scope ? 'Back to track' : 'Home'}</button>
      </div></div>`;
    lastMissed = missed;
  }
  let lastMissed = [];

  function renderRulebook() {
    stopSession();
    app.dataset.view = 'rulebook';
    window.scrollTo(0, 0);
    app.innerHTML = `<p><a href="#" data-action="back">← ${scope ? esc(docInfo(scope).title) : 'Home'}</a></p>
      <h1>📖 Rulebook</h1>
      <div class="toolbar">
        <input class="search" id="q" placeholder="Search rules, e.g. WeakPtr, patches, strings…" style="flex:1">
        <select id="docsel"><option value="">All docs</option>${DOCS.map((d) => `<option value="${esc(d.doc)}">${esc(d.title)}</option>`).join('')}</select>
        <select id="statussel"><option value="">Any status</option><option value="new">New</option><option value="learning">Learning</option><option value="mastered">Mastered</option></select>
      </div>
      <div class="hint" id="count"></div>
      <div class="rulelist" id="list"></div>`;
    const draw = () => {
      const q = $('#q').value.toLowerCase().trim();
      const doc = $('#docsel').value;
      const st = $('#statussel').value;
      const items = RULES.filter((r) => {
        if (doc && r.doc !== doc) return false;
        const b = progressOf(r.id).box;
        if (st === 'new' && progressOf(r.id).seen) return false;
        if (st === 'learning' && !(b > 0 && b < MASTERED_BOX)) return false;
        if (st === 'mastered' && b < MASTERED_BOX) return false;
        return !q || `${r.id} ${r.title} ${r.summary} ${r.body}`.toLowerCase().includes(q);
      });
      $('#count').textContent = `${items.length} rules`;
      $('#list').innerHTML = items.slice(0, 300).map((r) => {
        const b = progressOf(r.id).box;
        const dots = [1, 2, 3, 4, 5].map((n) => `<span class="${n <= b ? 'on' : ''}">●</span>`).join('');
        return `<details class="ruleitem" data-id="${esc(r.id)}"><summary><span class="rid">${esc(r.id)}</span>
          <span class="rt">${kindLabel(r)} ${inline(r.title)}</span><span class="dots" title="Leitner box ${b}/5">${dots}</span></summary>
          <div class="content"></div></details>`;
      }).join('');
    };
    if (scope) $('#docsel').value = scope;
    $('#q').addEventListener('input', draw);
    $('#docsel').addEventListener('change', draw);
    $('#statussel').addEventListener('change', draw);
    $('#list').addEventListener('toggle', (e) => {
      const d = e.target;
      if (d.open && !d.dataset.filled) {
        d.dataset.filled = '1';
        const r = ruleById.get(d.dataset.id);
        $('.content', d).innerHTML = ruleBlock(r, { full: true }) +
          `<div class="toolbar" style="margin-top:10px"><button class="btn small" data-drill="${esc(r.id)}">Quiz me on this</button></div>`;
      }
    }, true);
    draw();
  }

  // ---------- events ----------

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action],[data-start],[data-choice],[data-grade],[data-toggle],[data-track],[data-drill]');
    if (!el || el.disabled) return;
    if (el.dataset.start) return startSession(el.dataset.start);
    if (el.dataset.choice) return answer(Number(el.dataset.choice));
    if (el.dataset.grade) return gradeFlash(Number(el.dataset.grade));
    if (el.dataset.drill) return startSession('review', [ruleById.get(el.dataset.drill)]);
    if (el.dataset.toggle) {
      const d = el.dataset.toggle;
      state.off = state.off.includes(d) ? state.off.filter((x) => x !== d) : state.off.concat(d);
      save();
      return renderHome();
    }
    if (el.dataset.track) return renderTrack(el.dataset.track);
    e.preventDefault();
    switch (el.dataset.action) {
      case 'home': return renderHome();
      case 'back': return goBack();
      case 'rulebook': return renderRulebook();
      case 'next': return advance();
      case 'reveal': return revealFlash();
      case 'end': return endSession();
      case 'more': {
        const rb = $('#fb .rule');
        rb.innerHTML = ruleBlock(session.card.rule, { full: true });
        el.remove();
        return;
      }
      case 'retry': return startSession('review', shuffle(lastMissed));
      case 'all-on': state.off = []; save(); return renderHome();
      case 'all-off': state.off = DOCS.map((d) => d.doc); save(); return renderHome();
      case 'reset':
        if (confirm('Reset all progress, XP and streaks?')) {
          localStorage.removeItem(STORE_KEY);
          location.reload();
        }
        return;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target instanceof Element && e.target.matches('input, select, textarea')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Enter' && e.target instanceof Element && e.target.matches('[data-track]')) {
      return renderTrack(e.target.dataset.track);
    }
    if (e.key === 'Escape') return scope && app.dataset.view !== 'track' ? renderTrack(scope) : renderHome();
    if (!session || !session.card) return;
    const c = session.card;
    const n = Number(e.key);
    if (c.type === 'flash') {
      if (e.key === ' ' && !session.answered) { e.preventDefault(); revealFlash(); } else if (session.answered && n >= 1 && n <= 3) gradeFlash(n - 1);
      return;
    }
    if (!session.answered && n >= 1 && n <= c.choices.length) answer(n - 1);
    else if (session.answered && session.mode !== 'lightning' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); advance(); }
  });

  if (!RULES.length) {
    app.innerHTML = '<p>No rules loaded. Run <code>python3 tools/extract_rules.py</code>.</p>';
  } else {
    renderHome();
  }
})();

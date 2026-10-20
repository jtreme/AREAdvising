/* Paw Plan schedule builder: the screen.
 * Loads engine.js and the term's class data, reads the plan through window.PawPlanBridge,
 * and shows Plan A/B/C with backup sections, open-requirement choices, and MyPack class numbers.
 */
(function () {
  'use strict';
  var B = window.PawPlanBridge;
  if (!B || window.PawSched) return;
  var me = document.currentScript;
  var BASE = me && me.src ? me.src.replace(/[^/]*$/, '') : 'scheduler/';
  var VER = ((me && me.src) || '').match(/[?&]v=([^&]+)/);
  VER = VER ? VER[1] : String(Date.now());
  var CAT_COLORS = { orientation: '#7C2D12', comm: '#0369A1', math: '#6D28D9', natsci: '#4D7C0F', dept: '#CC0000', restricted: '#0F766E', gep: '#1D4ED8', free: '#57534E' };
  var MODE_TEXT = { P: 'In person', OA: 'Online, no set meeting time', OS: 'Online, scheduled meetings', PH: 'Hybrid', PR: 'In person', IH: 'In person', SA: 'Study abroad' };
  function termYear() { var m = String((state.index && state.index.term) || '').match(/(\d{4})/); return m ? +m[1] : 0; }
  function abroadText(u) { var d = E.fmtDays(u.d0, u.d1, termYear()); return 'Study abroad' + (d ? ', ' + d : ''); }
  function hiddenWhy(why) { return E.caveatText(why); }
  function hiddenHtml(list) {
    if (!list || !list.length) return '';
    return '<details class="pps-hidden"><summary>' + list.length + ' section' + (list.length === 1 ? '' : 's') + ' not shown</summary><ul>' + list.map(function (x) {
      var u = x.unit, s = u.sections[0];
      return '<li>' + u.sections.map(function (y) { return esc(y.comp + ' ' + y.sec) + ' <span class="pps-nbr">' + y.nbr + '</span>'; }).join(' + ') + ' ' + esc(meetText(u)) + (u.meetings.length && MODE_TEXT[s.mode] ? ', ' + esc(MODE_TEXT[s.mode]).toLowerCase() : '') +
        '<div class="pps-muted">' + esc(hiddenWhy(x.why)) + '</div></li>';
    }).join('') + '</ul></details>';
  }
  var STANDING_TEXT = { FR: 'Freshman', SO: 'Sophomore', JR: 'Junior', SR: 'Senior' };
  var PREF_KEY = 'pawplan-sched-prefs-v1';
  // Advisor view (?advisor=1): preferences reset for each student, an advising check sits on top,
  // and the copy button produces a note for advising records or an email to the student.
  var ADVISOR = /[?&]advisor=1\b/.test(location.search);
  var state = { manifest: null, term: null, index: null, result: null, pi: 0, prefs: loadPrefs(), open: false, expanded: {}, searches: {}, auditKey: null, autoOpen: false };
  var E = null;

  // ---------- boot ----------
  loadScript(BASE + 'engine.js?v=' + VER, function () {
    E = window.PawSchedEngine;
    fetchJSON(BASE + 'data/terms.json?v=' + VER, function (err, m) {
      if (err || !m || !m.terms || !m.terms.length) return;
      state.manifest = m;
      addToolbarButton();
    });
  });
  window.PawSched = { open: openBuilder, openAudit: function () { openAudit(); } };
  // After every confirmed audit upload, the audit view is the first screen.
  window.addEventListener('pawplan:auditapplied', function () {
    state.autoOpen = false;
    setTimeout(function () { if (state.manifest) openAudit(); }, 150);
  });

  function loadScript(src, cb) {
    var s = document.createElement('script');
    s.src = src; s.onload = cb;
    s.onerror = function () { console.warn('Schedule builder: could not load ' + src); };
    document.head.appendChild(s);
  }
  function fetchJSON(url, cb) {
    fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { cb(null, j); }).catch(function (e) { cb(e); });
  }
  function defaultPrefs() { return { earliest: 0, latest: 0, noFriday: false, online: 'allow', busy: [], standing: '', includeConsent: false }; }
  function loadPrefs() {
    var d = defaultPrefs();
    if (ADVISOR) return d;
    try { var raw = localStorage.getItem(PREF_KEY); if (raw) { var p = JSON.parse(raw); Object.keys(d).forEach(function (k) { if (p[k] !== undefined) d[k] = p[k]; }); } } catch (e) {}
    return d;
  }
  function savePrefs() { if (ADVISOR) return; try { localStorage.setItem(PREF_KEY, JSON.stringify(state.prefs)); } catch (e) {} }

  // The term being planned: the one the student switched to, else the first listed term in the plan.
  function planTerms() {
    var plan = B.getPlan();
    return state.manifest.terms.filter(function (t) { return plan.some(function (s) { return s.term === t.term; }); });
  }
  // Tabs: one per listed term in the plan; summer splits into Summer I and Summer II (one plan semester).
  // Summer I holds the 5-week first session, the 10-week session, and Maymester; Summer II the second session.
  var SUMMER_TABS = [['S1', 'Summer I', ['S1', 'S10', 'MAY']], ['S2', 'Summer II', ['S2']]];
  function termTabList() {
    var out = [];
    planTerms().forEach(function (t) {
      if (/^Summer/.test(t.term)) SUMMER_TABS.forEach(function (x) { out.push({ key: t.term + '|' + x[0], label: x[1] + ' ' + t.term.split(' ')[1], t: t, session: x[0], sessions: x[2] }); });
      else out.push({ key: t.term, label: t.term, t: t, session: null, sessions: null });
    });
    return out;
  }
  function pickTerm() {
    var list = termTabList(), tab = null;
    for (var i = 0; i < list.length; i++) if (list[i].key === state.chosen) tab = list[i];
    tab = tab || list[0];
    state.tab = tab || { key: '', label: state.manifest.terms[0].term, session: null, sessions: null };
    return tab ? tab.t : state.manifest.terms[0];
  }
  function termLabel() { return (state.tab && state.tab.label) || (state.term && state.term.term) || ''; }
  function termTabs() {
    var list = termTabList();
    if (list.length < 2) return '';
    return '<div class="pps-termtabs" role="tablist" aria-label="Term">' + list.map(function (t) {
      var on = state.tab && t.key === state.tab.key;
      return '<button type="button" role="tab" aria-selected="' + !!on + '" class="pps-termtab' + (on ? ' on' : '') + '" data-term="' + esc(t.key) + '">' + esc(t.label) + '</button>';
    }).join('') + '</div>';
  }
  // Summer sessions (from the course catalog export) and their labels.
  var SESSION_TEXT = { S1: 'Summer I', S2: 'Summer II', S10: '10-week (Summer I and II)', MAY: 'Maymester' };
  function sessionText(u) { var s = u && u.sections && u.sections[0] && u.sections[0].session; return SESSION_TEXT[s] || ''; }
  function isSummer() { return /^Summer/.test((state.term && state.term.term) || ''); }

  function addToolbarButton() {
    if (document.getElementById('pps-open-btn')) return;
    var anchor = document.getElementById('advising-btn') || document.getElementById('transcript-btn');
    if (!anchor) return;
    var btn = document.createElement('button');
    btn.id = 'pps-open-btn';
    btn.className = 'reset-btn';
    btn.type = 'button';
    btn.innerHTML = buttonLabel(state.manifest.terms[0].term);
    btn.addEventListener('click', function () { openAudit(); });
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    injectStyle();
  }

  function buttonLabel(term) { return '&#128197; ' + esc(termLabel()) + ' Registration <span class="pps-beta">Beta</span>'; }
  function studentName() { var st = B.getAuditStudent ? B.getAuditStudent() : null; return st && st.name ? st.name : ''; }

  // ---------- open / build ----------
  function syncStudent() {
    state.term = pickTerm();
    var btn = document.getElementById('pps-open-btn');
    if (btn) btn.innerHTML = buttonLabel(state.term.term);
    // New student in advisor view: start from clean preferences and no carried-over picks.
    var stu = B.getAuditStudent ? B.getAuditStudent() : null, key = stu ? String(stu.loadedAt) : '';
    if (ADVISOR && key !== state.auditKey) { state.prefs = defaultPrefs(); state.result = null; state.pi = 0; }
    state.auditKey = key;
  }
  function ensureData(cb) {
    var want = state.tab && state.tab.key || state.term.term;
    if (state.index && state.index.term === state.term.term && state.indexKey === want) { cb(); return; }
    fetchJSON(BASE + state.term.file + '?v=' + encodeURIComponent(state.term.built || VER), function (err, data) {
      if (err) { cb(err); return; }
      // Summer I / Summer II tab: keep that session's sections only.
      if (state.tab && state.tab.sessions) {
        var si = data.fields.indexOf('session'), keep = state.tab.sessions, ci = data.fields.indexOf('code');
        // Which summer session(s) each course is in, to say "offered in Summer II" on the Summer I tab.
        state.sessionsOf = {};
        data.sections.forEach(function (r) { var o = state.sessionsOf[r[ci]] = state.sessionsOf[r[ci]] || {}; o[r[si]] = 1; });
        data = Object.assign({}, data, { sections: data.sections.filter(function (r) { return keep.indexOf(r[si]) !== -1; }) });
      }
      state.indexKey = want;
      // Department corrections (optional file): courses listed there are treated as not offered.
      fetchJSON(BASE + 'data/overrides.json?v=' + Date.now(), function (e2, ov) {
        state.index = E.prepare(data, e2 ? null : ov);
        // NC community college transfer guide (optional file).
        fetchJSON(BASE + 'data/transfer-nccc.json?v=' + Date.now(), function (e3, cc) { state.cc = e3 ? null : cc; cb(); });
      });
    });
  }
  function openBuilder() {
    injectStyle();
    syncStudent();
    shell();
    state.open = true;
    document.body.classList.add('pps-open');
    if (!B.isUploaded()) { renderMessage('Upload your degree audit first', 'The schedule builder works from the ' + state.term.term + ' courses in your Paw Plan. Close this window, click <strong>Upload New Degree Audit</strong>, then come back.'); return; }
    if (!(state.index && state.index.term === state.term.term)) renderMessage('Loading ' + state.term.term + ' classes...', '');
    ensureData(function (err) {
      if (err) { renderMessage('Could not load the class schedule', 'Check your connection and try again.'); return; }
      build();
    });
  }

  function build() {
    var p = state.prefs;
    var plan = B.getPlan();
    // Keep courses the student picked for open requirements when preferences change.
    var keep = {};
    if (state.result && state.result.plans) state.result.plans.forEach(function (pl) {
      (pl.open || []).forEach(function (o) { if (o.pick && !o.suggested && !keep[o.slot.ci]) keep[o.slot.ci] = o.pick.code; });
    });
    state.result = E.buildSchedules(state.index, plan, B.lists, {
      earliest: +p.earliest || 0, latest: +p.latest || 0, noFriday: !!p.noFriday, online: p.online,
      busy: p.busy, includeConsent: !!p.includeConsent, full: fullSet()
    }, { transferred: B.getTransferred(), standing: p.standing || undefined, gpa: B.getAuditGpa() });
    (state.result.plans || []).forEach(function (pl) {
      var touched = false;
      pl.open.forEach(function (o) {
        var code = keep[o.slot.ci];
        if (!code) return;
        var c = null;
        for (var i = 0; i < o.candidates.length; i++) if (o.candidates[i].code === code) { c = o.candidates[i]; break; }
        if (!c && o.slot.isFree) { var found = state.result.search(pl, o, code, 5).filter(function (x) { return x.code === code; }); c = found[0] || null; }
        if (c) { o.pick = c; o.suggested = false; touched = true; } else { o.pick = null; o.dropped = true; touched = true; }
      });
      if (touched) state.result.refresh(pl);
    });
    if (state.pi >= (state.result.plans || []).length) state.pi = 0;
    state.expanded = {}; state.searches = {};
    renderPrefs();
    renderMain();
  }
  var rebuildTimer = null;
  function rebuildSoon() { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(function () { savePrefs(); build(); }, 120); }

  function close() {
    state.open = false;
    document.body.classList.remove('pps-open');
    var o = document.getElementById('pps-overlay');
    if (o) o.remove();
  }

  // ---------- shell ----------
  function shell() {
    var o = document.getElementById('pps-overlay');
    if (o) o.remove();
    o = document.createElement('div');
    o.id = 'pps-overlay';
    o.className = 'pps';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.setAttribute('aria-labelledby', 'pps-title');
    o.innerHTML =
      '<div class="pps-top"><div class="pps-top-in"><div><div class="pps-kicker">Paw Plan</div>' +
      '<h2 id="pps-title">' + esc(state.term.term) + (ADVISOR ? ' Advising' + (studentName() ? ': ' + esc(studentName()) : '') : ' Schedule Builder') + ' <span class="pps-beta">Beta</span></h2></div>' +
      '<div class="pps-topbtns"><button type="button" class="pps-back">&larr; My audit</button><button type="button" class="pps-x" aria-label="Close schedule builder">&times;</button></div></div></div>' +
      '<div class="pps-body"><aside class="pps-prefs" aria-label="Preferences"></aside><main class="pps-main"></main></div>';
    document.body.appendChild(o);
    o.querySelector('.pps-x').addEventListener('click', close);
    o.querySelector('.pps-back').addEventListener('click', function () { openAudit(); });
    o.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    o.querySelector('.pps-x').focus();
  }
  function renderMessage(title, html) {
    var o = document.getElementById('pps-overlay');
    if (!o) return;
    o.querySelector('.pps-prefs').innerHTML = '';
    o.querySelector('.pps-main').innerHTML = '<div class="pps-msg"><h3>' + esc(title) + '</h3><p>' + html + '</p></div>';
  }

  // ---------- preferences ----------
  function timeOptions(sel, list, anyLabel) {
    var h = '<option value="0"' + (!+sel ? ' selected' : '') + '>' + anyLabel + '</option>';
    list.forEach(function (m) { h += '<option value="' + m + '"' + (+sel === m ? ' selected' : '') + '>' + E.fmtTime(m) + '</option>'; });
    return h;
  }
  function halfHours(a, b) { var o = []; for (var m = a; m <= b; m += 30) o.push(m); return o; }

  function renderPrefs() {
    var o = document.getElementById('pps-overlay');
    if (!o) return;
    var p = state.prefs, ctx = state.result && state.result.ctx;
    var auto = ctx ? ctx.student.autoStanding : 'FR';
    var busyRows = (p.busy || []).map(function (b, i) {
      return '<li><span>' + b.days.map(function (d) { return E.DAY_NAMES[d]; }).join(', ') + ' ' + E.fmtTime(b.start) + '&ndash;' + E.fmtTime(b.end) + '</span>' +
        '<button type="button" class="pps-link" data-rm-busy="' + i + '" aria-label="Remove busy time">Remove</button></li>';
    }).join('');
    var dayBoxes = [0, 1, 2, 3, 4].map(function (d) { return '<label class="pps-day"><input type="checkbox" value="' + d + '"><span>' + E.DAY_NAMES[d].slice(0, d === 3 ? 2 : 1).replace('Th', 'Th') + '</span></label>'; }).join('');
    var wide = window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
    o.querySelector('.pps-prefs').innerHTML =
      '<details class="pps-prefbox"' + (wide ? ' open' : '') + '><summary>Your preferences</summary>' +
      '<label class="pps-field"><span>No classes before</span><select data-pref="earliest">' + timeOptions(p.earliest, halfHours(540, 720), 'Any time') + '</select></label>' +
      '<label class="pps-field"><span>Done by</span><select data-pref="latest">' + timeOptions(p.latest, halfHours(780, 1260), 'Any time') + '</select></label>' +
      '<label class="pps-check"><input type="checkbox" data-pref="noFriday"' + (p.noFriday ? ' checked' : '') + '><span>No Friday classes</span></label>' +
      '<label class="pps-field"><span>Online sections</span><select data-pref="online">' +
      [['allow', 'Fine either way'], ['prefer', 'Prefer online'], ['avoid', 'Avoid online']].map(function (x) { return '<option value="' + x[0] + '"' + (p.online === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') +
      '</select></label>' +
      '<div class="pps-busy"><div class="pps-flabel">Busy times (work, practice)</div><ul>' + busyRows + '</ul>' +
      '<div class="pps-busy-add"><div class="pps-days" role="group" aria-label="Days">' + dayBoxes + '</div>' +
      '<div class="pps-busy-times"><select aria-label="From" class="pps-bfrom">' + halfHours(420, 1290).map(function (m) { return '<option value="' + m + '"' + (m === 780 ? ' selected' : '') + '>' + E.fmtTime(m) + '</option>'; }).join('') + '</select>' +
      '<span>to</span><select aria-label="To" class="pps-bto">' + halfHours(450, 1320).map(function (m) { return '<option value="' + m + '"' + (m === 1020 ? ' selected' : '') + '>' + E.fmtTime(m) + '</option>'; }).join('') + '</select>' +
      '<button type="button" class="pps-btn pps-btn-sm pps-addbusy">Add</button></div></div></div>' +
      '<label class="pps-field"><span>Class standing in ' + esc(state.term.term.split(' ')[0].toLowerCase()) + '</span><select data-pref="standing">' +
      '<option value=""' + (!p.standing ? ' selected' : '') + '>' + STANDING_TEXT[auto] + ' (from ' + (ctx ? ctx.priorCredits : 0) + ' credits)</option>' +
      ['FR', 'SO', 'JR', 'SR'].map(function (s) { return '<option value="' + s + '"' + (p.standing === s ? ' selected' : '') + '>' + STANDING_TEXT[s] + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="pps-check"><input type="checkbox" data-pref="includeConsent"' + (p.includeConsent ? ' checked' : '') + '><span>Include sections that need instructor or department consent</span></label>' +
      '</details>';
    var root = o.querySelector('.pps-prefs');
    root.querySelectorAll('[data-pref]').forEach(function (el) {
      el.addEventListener('change', function () {
        var k = el.getAttribute('data-pref');
        state.prefs[k] = el.type === 'checkbox' ? el.checked : el.value;
        rebuildSoon();
      });
    });
    root.querySelectorAll('[data-rm-busy]').forEach(function (el) {
      el.addEventListener('click', function () { state.prefs.busy.splice(+el.getAttribute('data-rm-busy'), 1); rebuildSoon(); });
    });
    root.querySelector('.pps-addbusy').addEventListener('click', function () {
      var days = []; root.querySelectorAll('.pps-days input:checked').forEach(function (c) { days.push(+c.value); });
      var a = +root.querySelector('.pps-bfrom').value, b = +root.querySelector('.pps-bto').value;
      if (!days.length || b <= a) { flash(root.querySelector('.pps-busy-add'), days.length ? 'End time must be after start time.' : 'Pick at least one day.'); return; }
      state.prefs.busy.push({ days: days, start: a, end: b });
      rebuildSoon();
    });
  }
  function flash(el, msg) {
    var n = el.querySelector('.pps-err') || document.createElement('div');
    n.className = 'pps-err'; n.textContent = msg; el.appendChild(n);
    setTimeout(function () { if (n.parentNode) n.remove(); }, 2500);
  }

  // ---------- main ----------
  function renderMain() {
    var o = document.getElementById('pps-overlay');
    if (!o) return;
    var main = o.querySelector('.pps-main');
    var scroll = main.scrollTop;
    var r = state.result;
    if (!r.ok) {
      main.innerHTML = '<div class="pps-msg"><h3>No ' + esc(termLabel()) + ' semester in your plan</h3><p>Paw Plan did not place any courses in ' + esc(termLabel()) +
        '. If you are graduating or on leave that term, there is nothing to schedule. Otherwise, check the planning start term you confirmed when you uploaded your audit.</p></div>';
      return;
    }
    var h = '<p class="pps-source">Times from the ' + esc(termLabel()) + ' Schedule of Classes. ' + esc(staleNote().replace(/ If a section is full.*$/, '')) +
      ' Built from the current Paw Plan: after moving courses between semesters, reopen this window to rebuild.</p>';
    var severe = r.notes.filter(function (n) { return n.severe; }), mild = r.notes.filter(function (n) { return !n.severe; });
    if (ADVISOR && r.plans.length) h += advisorPanel(r, r.plans[state.pi] || r.plans[0]);
    else if (severe.length) h += '<div class="pps-alert">' + severe.map(function (n) { return '<p>' + esc(n.text) + '</p>'; }).join('') + '</div>';
    if (r.relaxed && !ADVISOR) h += '<div class="pps-warn"><p><strong>No schedule meets every preference.</strong> These plans come closest. Courses that break a preference are marked, usually because every section of that course meets at that time.</p></div>';
    if (!r.plans.length) {
      h += '<div class="pps-msg"><h3>No schedule fits</h3><p>Paw Plan could not fit these courses together. Try removing a busy time or a preference.</p></div>';
      main.innerHTML = h; return;
    }
    h += '<div class="pps-tabs" role="tablist">' + r.plans.map(function (p, i) {
      return '<button type="button" role="tab" class="pps-tab' + (i === state.pi ? ' on' : '') + '" aria-selected="' + (i === state.pi) + '" data-pi="' + i + '">' +
        '<span class="pps-tab-l">' + esc(p.label) + '</span><span class="pps-tab-s">' + esc(planSubtitle(p)) + '</span></button>';
    }).join('') + '</div>';
    var plan = r.plans[state.pi];
    h += '<section class="pps-plan" role="tabpanel">';
    h += summaryLine(plan);
    h += calendar(plan);
    h += '<h3 class="pps-h">Your classes</h3>' + plan.items.map(function (it, i) { return itemCard(plan, it, i); }).join('');
    if (plan.open.length) h += '<h3 class="pps-h">Requirements you choose</h3><p class="pps-sub">Paw Plan suggests a course that fits the gaps in this plan. Pick any course from the list instead, or search.</p>' + plan.open.map(function (o2, i) { return openCard(plan, o2, i); }).join('');
    if (mild.length) h += '<div class="pps-note">' + mild.map(function (n) { return '<p>' + esc(n.text) + '</p>'; }).join('') + '</div>';
    h += mypackBox(plan);
    h += '</section>';
    main.innerHTML = h;
    main.scrollTop = scroll;
    wireMain(main, plan);
  }

  function planSubtitle(p) {
    if (p.kind === 'best') return p.relaxed ? 'Closest fit' : 'Best fit';
    if (p.kind === 'courses' && p.diff) return p.diff.added.join(', ') + ' instead of ' + p.diff.removed.join(', ');
    return 'Different times';
  }
  function summaryLine(plan) {
    var openCr = 0, openN = 0;
    plan.open.forEach(function (o) { openN++; openCr += Number(o.slot.units) || 0; });
    var days = {};
    plan.items.forEach(function (it) { it.unit.meetings.forEach(function (m) { m.days.forEach(function (d) { days[d] = 1; }); }); });
    plan.open.forEach(function (o) { if (o.pick) o.pick.groupsFit.forEach(function (g) { g.meetings.forEach(function (m) { m.days.forEach(function (d) { days[d] = 1; }); }); }); });
    var dn = Object.keys(days).sort().map(function (d) { return E.DAY_NAMES[d]; });
    return '<div class="pps-summary"><div><strong>' + plan.credits + '</strong> credits scheduled' + (openN ? ' + <strong>' + openCr + '</strong> to choose' : '') + '</div>' +
      '<div>On campus: <strong>' + (dn.length ? dn.join(', ') : 'no set days') + '</strong></div></div>';
  }

  // ---------- calendar ----------
  function calendar(plan) {
    var ev = [];
    plan.items.forEach(function (it) {
      it.unit.meetings.forEach(function (m) { ev.push({ m: m, label: it.code, sub: m.sec.comp + ' ' + m.sec.sec, color: CAT_COLORS[it.slot.cat] || '#444', kind: 'class' }); });
    });
    plan.open.forEach(function (o) {
      if (!o.pick) return;
      o.pick.groupsFit.forEach(function (g) { g.meetings.forEach(function (m) { ev.push({ m: m, label: m.code, sub: m.sec.comp + ' ' + m.sec.sec, color: CAT_COLORS[o.slot.cat] || '#444', kind: 'pick' }); }); });
    });
    (state.prefs.busy || []).forEach(function (b) { ev.push({ m: { days: b.days, start: b.start, end: b.end }, label: 'Busy', sub: '', color: '#777', kind: 'busy' }); });
    var lo = 8 * 60, hi = 17 * 60, sat = false;
    ev.forEach(function (e) { lo = Math.min(lo, Math.floor(e.m.start / 60) * 60); hi = Math.max(hi, Math.ceil(e.m.end / 60) * 60); if (e.m.days.indexOf(5) !== -1) sat = true; });
    var days = sat ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4];
    var PPM = 0.9, H = (hi - lo) * PPM;
    var h = '<div class="pps-cal-wrap"><div class="pps-cal" style="--cols:' + days.length + '">';
    h += '<div class="pps-cal-head"></div>' + days.map(function (d) { return '<div class="pps-cal-head">' + E.DAY_NAMES[d] + '</div>'; }).join('');
    // Courses with no meeting time (online, study abroad, TBA) sit in a row above the grid.
    var floating = [];
    plan.items.forEach(function (it) { if (!it.unit.meetings.length) floating.push({ code: it.code, cat: it.slot.cat, txt: (sessionText(it.unit) ? sessionText(it.unit) + ' \u00b7 ' : '') + (it.unit.studyAbroad ? abroadText(it.unit) : it.unit.online ? 'Online, no set time' : 'Time TBA') }); });
    plan.open.forEach(function (o) { if (o.pick && o.pick.groupsFit.every(function (g) { return !g.meetings.length; })) floating.push({ code: o.pick.code, cat: o.slot.cat, txt: 'Online, no set time' }); });
    if (floating.length) h += '<div class="pps-cal-alld">No set time</div><div class="pps-cal-float">' + floating.map(function (f) {
      return '<span class="pps-ev-float" style="--c:' + (CAT_COLORS[f.cat] || '#444') + '"><strong>' + esc(f.code) + '</strong> ' + esc(f.txt) + '</span>';
    }).join('') + '</div>';
    h += '<div class="pps-cal-times" style="height:' + H + 'px">';
    for (var t = lo; t < hi; t += 60) h += '<div class="pps-cal-t" style="top:' + ((t - lo) * PPM) + 'px">' + E.fmtTime(t).replace(':00', '') + '</div>';
    h += '</div>';
    days.forEach(function (d) {
      var mine = ev.filter(function (e) { return e.m.days.indexOf(d) !== -1; }).sort(function (a, b) { return a.m.start - b.m.start; });
      // lanes for overlaps (two 8-week classes in the same slot, or a busy block under a class)
      var lanes = [];
      mine.forEach(function (e) {
        var L = 0;
        while (lanes[L] && lanes[L].some(function (x) { return x.m.start < e.m.end && e.m.start < x.m.end; })) L++;
        (lanes[L] = lanes[L] || []).push(e); e.lane = L;
      });
      var nl = Math.max(1, lanes.length);
      h += '<div class="pps-cal-col" style="height:' + H + 'px">';
      for (var t2 = lo; t2 < hi; t2 += 60) h += '<div class="pps-cal-line" style="top:' + ((t2 - lo) * PPM) + 'px"></div>';
      mine.forEach(function (e) {
        var top = (e.m.start - lo) * PPM, ht = Math.max(18, (e.m.end - e.m.start) * PPM - 2);
        var w = 100 / nl, left = e.lane * w;
        var half = e.m.sec && e.m.sec.session === '8W1' ? '1st 8 weeks' : e.m.sec && e.m.sec.session === '8W2' ? '2nd 8 weeks' : (e.m.sec && SESSION_TEXT[e.m.sec.session]) || '';
        h += '<div class="pps-ev pps-ev-' + e.kind + '" style="top:' + top + 'px;height:' + ht + 'px;left:calc(' + left + '% + 2px);width:calc(' + w + '% - 4px);--c:' + e.color + '" title="' +
          esc(e.label + ' ' + E.fmtTime(e.m.start) + '-' + E.fmtTime(e.m.end)) + '"><strong>' + esc(e.label) + '</strong>' +
          (ht > 30 ? '<span>' + esc([e.sub, E.fmtTime(e.m.start) + '–' + E.fmtTime(e.m.end)].filter(Boolean).join(' · ')) + '</span>' : '') +
          (half && ht > 44 ? '<span>' + half + '</span>' : '') + '</div>';
      });
      h += '</div>';
    });
    h += '</div></div>';
    return h;
  }

  // ---------- course cards ----------
  function meetText(u) {
    var ses = sessionText(u);
    if (ses) return ses + ' (' + E.fmtDays(u.d0, u.d1, termYear()) + ') \u00b7 ' + baseMeetText(u);
    return baseMeetText(u);
  }
  function baseMeetText(u) {
    if (u.studyAbroad) return abroadText(u);
    if (!u.meetings.length) return u.online ? 'Online, no set meeting time' : 'Time TBA';
    return u.meetings.map(function (m) {
      var half = m.sec.session === '8W1' ? ' (1st 8 weeks)' : m.sec.session === '8W2' ? ' (2nd 8 weeks)' : '';
      return m.days.map(function (d) { return E.DAY_NAMES[d]; }).join('/') + ' ' + E.fmtTime(m.start) + '–' + E.fmtTime(m.end) + half;
    }).join('; ');
  }
  function secLines(u) {
    return u.sections.map(function (s) {
      var t = s.mode === 'SA' ? E.fmtDays(s.startDay, s.endDay, termYear()) : s.dayList.length && s.start >= 0 ? s.dayList.map(function (d) { return E.DAY_NAMES[d]; }).join('/') + ' ' + E.fmtTime(s.start) + '–' + E.fmtTime(s.end) : (s.mode === 'OA' ? '' : 'Time TBA');
      return '<div class="pps-sec"><span class="pps-comp">' + esc(s.comp) + ' ' + esc(s.sec) + '</span>' +
        '<span class="pps-nbr" title="Class number for MyPack">' + s.nbr + '</span>' +
        (t ? '<span>' + esc(t) + '</span>' : '') + '<span>' + esc(MODE_TEXT[s.mode] || s.mode) + '</span>' +
        (s.instructor ? '<span>' + esc(s.instructor) + '</span>' : '') +
        (ADVISOR ? '<span>' + Math.max(0, s.avail) + ' of ' + s.cap + ' open on ' + esc(shortDate(asOf())) + '</span>' : '') + '</div>';
    }).join('');
  }
  function violText(v) { return (v || []).map(function (x) { return E.VIOLATION_TEXT[x]; }).join(', '); }

  function itemCard(plan, it, i) {
    var u = it.unit, key = state.pi + ':' + i;
    var flags = [];
    if (it.viol && it.viol.length) flags.push('<span class="pps-flag warn">This section ' + esc(violText(it.viol)) + '</span>');
    if (it.prereq) flags.push('<span class="pps-flag">' + esc(it.prereq) + '</span>');
    if (it.group.note) flags.push('<span class="pps-flag' + (it.group.restricted ? ' warn' : '') + '">' + esc(it.group.note) + '</span>');
    if (u.tentative) flags.push('<span class="pps-flag">Tentative section: the department may still cancel or change it</span>');
    if (u.restrict.length) flags.push('<span class="pps-flag muted">Section note: ' + esc(u.restrict.join('; ')) + '</span>');
    var req = it.slot.label !== it.code ? '<span class="pps-req">Fills: ' + esc(it.slot.label) + '</span>' : '';
    var others = '';
    if (it.slot.kind === 'choice' && it.slot.usableInfo && it.slot.usableInfo.length > 1) {
      var alts = it.slot.usableInfo.filter(function (x) { return x.option.join(' + ') !== it.code && x.option.indexOf(it.code) === -1; });
      if (alts.length) others = '<div class="pps-alts">Other courses for this requirement: ' + alts.map(function (x) { return esc(x.option.join(' + ')) + (x.prereq ? ' (check prerequisite)' : ''); }).join(', ') + '</div>';
    }
    if (it.slot.dropped && it.slot.dropped.length) others += '<div class="pps-alts">Not available: ' + it.slot.dropped.map(function (d) { return esc(d.why); }).join('; ') + '</div>';
    var bk = it.backups || [], open = state.expanded[key], shown = open === 'all' ? bk : bk.slice(0, 8);
    var bh = '';
    if (bk.length) {
      bh = '<details class="pps-backups"' + (open ? ' open' : '') + ' data-key="' + key + '"><summary>Backup sections (' + bk.length + ')' +
        (bk.filter(function (b) { return b.same; }).length ? ' <span class="pps-muted">' + bk.filter(function (b) { return b.same; }).length + ' at the same time</span>' : '') + '</summary><ol>' +
        shown.map(function (b, j) {
          return '<li><div class="pps-bk-main">' + (b.same ? '<span class="pps-badge">Same time</span> ' : '') +
            (b.viol && b.viol.length ? '<span class="pps-flag warn">' + esc(violText(b.viol)) + '</span>' : '') + secLines(b.unit) + '</div>' +
            '<button type="button" class="pps-btn pps-btn-sm" data-use="' + i + ':' + j + '" aria-label="Use this section of ' + esc(it.code) + '">Use this</button></li>';
        }).join('') + '</ol>' +
        (bk.length > shown.length ? '<button type="button" class="pps-link" data-all="' + key + '">Show all ' + bk.length + '</button>' : '') + '</details>';
    } else {
      var total = 0;
      (state.result.sectionsOf(it.code).groups || []).forEach(function (g) { total += g.units.length; });
      bh = '<div class="pps-nobk">' + (total <= 1 ? 'This is the only section of ' + esc(it.code) + ' you can take this term, so register for it early.' :
        'No other section fits this plan. If this one fills, try ' + (r2(plan) ? 'another plan tab or ' : '') + 'talk with your advisor.') + '</div>';
    }
    var pa = state.result.pullAhead(plan, it).slice(0, 4), ph = '';
    if (pa.length) {
      ph = '<details class="pps-backups pps-pull"><summary>If every section fills: ' + pa.length + ' later course' + (pa.length === 1 ? '' : 's') + ' you could take now</summary>' +
        '<p class="pps-muted">These are in a later semester of ' + (ADVISOR ? 'the student\'s' : 'your') + ' plan, are offered this term, fit the rest of this schedule, and ' + (ADVISOR ? 'the student has' : 'you have') + ' the prerequisites. To switch, move one into ' + esc(termLabel()) + ' in Paw Plan, move ' + esc(it.code) + ' to a later semester, and reopen this window.</p><ol>' +
        pa.map(function (c) {
          return '<li><div class="pps-bk-main"><strong>' + esc(c.code) + '</strong> ' + esc(c.title) + ' <span class="pps-muted">Planned for ' + esc(c.fromTerm) + (c.label !== c.code ? ' (' + esc(c.label) + ')' : '') + ' \u00b7 ' + c.sectionsFit + ' section' + (c.sectionsFit === 1 ? '' : 's') + ' fit</span>' + secLines(c.group.rep) + '</div></li>';
        }).join('') + '</ol></details>';
    }
    return '<article class="pps-card" style="--c:' + (CAT_COLORS[it.slot.cat] || '#444') + '"><header><div><h4>' + esc(it.code) + ' <span>' + esc(it.info.lt || it.info.t || '') + '</span></h4>' + req + '</div>' +
      '<div class="pps-when">' + esc(meetText(u)) + '</div></header>' + secLines(u) + (flags.length ? '<div class="pps-flags">' + flags.join('') + '</div>' : '') + others + bh + ph + '</article>';
  }
  function r2(plan) { return state.result.plans.length > 1; }

  function openCard(plan, o, i) {
    var s = o.slot, key = 'o' + state.pi + ':' + i;
    var title = s.isFree ? 'Free elective' : (s.tag || s.label);
    var h = '<article class="pps-card pps-open-card" style="--c:' + (CAT_COLORS[s.cat] || '#444') + '"><header><div><h4>' + esc(title) + ' <span>' + esc(s.units + ' cr') + '</span></h4>' +
      (s.isFree ? '' : '<span class="pps-req">' + o.candidates.length + ' course' + (o.candidates.length === 1 ? '' : 's') + ' from the approved list fit this plan</span>') + '</div></header>';
    if (o.pick) {
      h += '<div class="pps-pick"><div class="pps-pick-l">' + (o.suggested ? 'Suggested' : 'Your choice') + '</div><div class="pps-pick-c"><strong>' + esc(o.pick.code) + '</strong> ' + esc(o.pick.title) + candBadges(o.pick) + '</div>' +
        '<div class="pps-when">' + esc(o.pick.groupsFit.map(function (g) { return meetText(g.rep); }).join('; ')) + '</div>' +
        '<button type="button" class="pps-link" data-clear="' + i + '">Clear</button></div>' + o.pick.groupsFit.map(function (g) { return secLines(g.rep) + (g.units.length > 1 ? '<div class="pps-muted pps-same">' + (g.units.length - 1) + ' more section' + (g.units.length > 2 ? 's' : '') + ' at this time: ' + g.units.slice(1).map(function (u) { return u.sections.map(function (x) { return x.nbr; }).join('+'); }).join(', ') + '</div>' : ''); }).join('');
    } else if (o.dropped) {
      h += '<div class="pps-alts">Your earlier choice no longer fits after the last change. Pick again below.</div>';
    } else if (!s.isFree && o.candidates.length) {
      h += '<div class="pps-alts">Pick one that interests you. Every course listed fits this plan.</div>';
    }
    if (s.isFree) h += '<p class="pps-sub">Almost any course counts. Search for something that fits your open times, such as a subject (SPA, BUS) or a word in the title.</p>';
    var q = state.searches[key] || '';
    h += '<div class="pps-search"><input type="search" placeholder="' + (s.isFree ? 'Search all courses that fit' : 'Filter this list or search all courses') + '" value="' + esc(q) + '" data-search="' + i + '" aria-label="Search courses for ' + esc(title) + '"></div>';
    var list;
    if (q.length >= 2) {
      var ql = q.toLowerCase();
      var fromList = o.candidates.filter(function (c) { return (c.code + ' ' + c.title).toLowerCase().indexOf(ql) !== -1; });
      list = fromList;
      // Free electives search everything; other requirements search the whole catalog only when the approved list has no match.
      if (s.isFree || !fromList.length) {
        var extra = state.result.search(plan, o, q, 30).filter(function (c) { return !fromList.some(function (f) { return f.code === c.code; }); });
        if (!s.isFree) extra.forEach(function (c) { c.offList = true; });
        list = fromList.concat(extra);
      }
    } else list = s.isFree ? [] : o.candidates;
    var more = state.expanded[key] === 'all';
    var shown = more ? list : list.slice(0, 10);
    if (list.length) {
      h += '<ol class="pps-cands">' + shown.map(function (c, j) {
        var isPick = o.pick && o.pick.code === c.code;
        return '<li' + (isPick ? ' class="on"' : '') + '><div><strong>' + esc(c.code) + '</strong> ' + esc(c.title) + candBadges(c) +
          '<div class="pps-muted">' + esc(meetText(c.groupsFit[0].rep)) + ' · ' + c.sectionsFit + ' section' + (c.sectionsFit === 1 ? '' : 's') + ' fit</div></div>' +
          (isPick ? '<span class="pps-badge">Chosen</span>' : '<button type="button" class="pps-btn pps-btn-sm" data-pick="' + i + ':' + j + '">Use</button>') + '</li>';
      }).join('') + '</ol>' + (list.length > shown.length ? '<button type="button" class="pps-link" data-all="' + key + '">Show all ' + list.length + '</button>' : '');
      state.lists = state.lists || {}; state.lists[i] = list;
    } else if (q.length >= 2) h += '<p class="pps-muted">Nothing matching "' + esc(q) + '" fits this plan.</p>';
    return h + '</article>';
  }
  function candBadges(c) {
    var b = '';
    c.alsoCounts.forEach(function (a) { b += ' <span class="pps-badge good">Also counts: ' + esc(a) + '</span>'; });
    if (c.online) b += ' <span class="pps-badge">Online</span>';
    if (c.viol) b += ' <span class="pps-badge warn">Breaks a preference</span>';
    if (c.prereq) b += ' <span class="pps-badge warn" title="' + esc(c.prereq) + '">Check prerequisite</span>';
    if (c.offList) b += ' <span class="pps-badge warn">Not on the approved list; ask your advisor</span>';
    return b;
  }

  // ---------- MyPack ----------
  // Registration order: courses with the fewest backup sections first, so the student
  // grabs the seats that are hardest to replace before anything else.
  function mypackLines(plan) {
    var lines = [];
    plan.items.forEach(function (it) {
      var bk = (it.backups || []).slice(0, 3).map(function (b) { return b.unit.sections.map(function (s) { return s.nbr; }).join('+'); });
      lines.push({ code: it.code, secs: it.unit.sections, backups: bk, nBackups: (it.backups || []).length });
    });
    lines.sort(function (a, b) { return a.nBackups - b.nBackups; });
    plan.open.forEach(function (o) {
      if (!o.pick) return;
      o.pick.groupsFit.forEach(function (g) { lines.push({ code: g.code, secs: g.rep.sections, backups: g.units.slice(1, 4).map(function (u) { return u.sections.map(function (s) { return s.nbr; }).join('+'); }), chosen: true, nBackups: g.units.length - 1 }); });
    });
    return lines;
  }
  function mypackBox(plan) {
    var lines = mypackLines(plan);
    return '<div class="pps-mypack"><h3 class="pps-h">Class numbers for MyPack</h3><p class="pps-sub">Register in this order: the courses with the fewest backup sections come first. For a lecture with a lab, recitation, or problem session, MyPack asks for both numbers.</p>' +
      '<table><thead><tr><th>#</th><th>Course</th><th>Section</th><th>Class number</th><th>Backups</th></tr></thead><tbody>' +
      lines.map(function (l, n) {
        return '<tr><td>' + (n + 1) + '</td><td>' + esc(l.code) + (l.chosen ? ' <span class="pps-muted">(your choice)</span>' : '') + '</td><td>' + l.secs.map(function (s) { return esc(s.comp + ' ' + s.sec); }).join(' + ') + '</td><td class="pps-nbr-cell">' +
          l.secs.map(function (s) { return s.nbr; }).join(' + ') + '</td><td>' + (l.backups.length ? esc(l.backups.join(', ')) : '<span class="pps-muted">none</span>') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="pps-actions">' + (ADVISOR ? '<button type="button" class="pps-btn" data-act="note">Copy advising note</button><button type="button" class="pps-btn pps-btn-ghost" data-act="copy">Copy class numbers</button>' : '<button type="button" class="pps-btn" data-act="copy">Copy class numbers</button>') +
      '<button type="button" class="pps-btn pps-btn-ghost" data-act="save">Save course choices to ' + (ADVISOR ? 'Paw Plan' : 'my Paw Plan') + '</button>' +
      (ADVISOR ? '<button type="button" class="pps-btn pps-btn-ghost" data-act="next">Next student</button>' : '') +
      '<button type="button" class="pps-btn pps-btn-ghost" data-act="print">Print this plan</button><span class="pps-actmsg" aria-live="polite"></span></div></div>';
  }
  function copyText(plan) {
    var t = state.index.term + ' ' + plan.label + ' (Paw Plan)\n';
    mypackLines(plan).forEach(function (l) {
      t += l.code + '  ' + l.secs.map(function (s) { return s.comp + ' ' + s.sec + ': ' + s.nbr; }).join(' + ') + (l.backups.length ? '   backups: ' + l.backups.join(', ') : '') + '\n';
    });
    return t;
  }

  // ---------- events ----------
  function wireMain(main, plan) {
    main.querySelectorAll('[data-pi]').forEach(function (b) {
      b.addEventListener('click', function () { state.pi = +b.getAttribute('data-pi'); state.expanded = {}; state.searches = {}; main.scrollTop = 0; renderMain(); });
    });
    main.querySelectorAll('details.pps-backups').forEach(function (d) {
      d.addEventListener('toggle', function () { var k = d.getAttribute('data-key'); if (d.open) state.expanded[k] = state.expanded[k] || 'some'; else delete state.expanded[k]; });
    });
    main.querySelectorAll('[data-all]').forEach(function (b) { b.addEventListener('click', function () { state.expanded[b.getAttribute('data-all')] = 'all'; renderMain(); }); });
    main.querySelectorAll('[data-use]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-use').split(':'), it = plan.items[+p[0]], bk = it.backups[+p[1]];
        it.unit = bk.unit; it.group = bk.group;
        state.result.refresh(plan);
        renderMain();
      });
    });
    main.querySelectorAll('[data-pick]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-pick').split(':'), o = plan.open[+p[0]];
        o.pick = state.lists[+p[0]][+p[1]]; o.suggested = false; o.dropped = false;
        state.searches['o' + state.pi + ':' + p[0]] = '';
        state.result.refresh(plan);
        renderMain();
      });
    });
    main.querySelectorAll('[data-clear]').forEach(function (b) {
      b.addEventListener('click', function () { var o = plan.open[+b.getAttribute('data-clear')]; o.pick = null; o.suggested = false; state.result.refresh(plan); renderMain(); });
    });
    main.querySelectorAll('[data-search]').forEach(function (inp) {
      var t = null;
      inp.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          var i = inp.getAttribute('data-search');
          state.searches['o' + state.pi + ':' + i] = inp.value;
          renderMain();
          var again = main.querySelector('[data-search="' + i + '"]');
          if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        }, 250);
      });
    });
    main.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-act'), msg = main.querySelector('.pps-actmsg');
        if (act === 'next') { close(); if (B.openAuditUpload) B.openAuditUpload(); return; }
        if (act === 'copy' || act === 'note') {
          var txt = act === 'note' ? advisingNote(state.result, plan) : copyText(plan);
          var done = function () { msg.textContent = 'Copied.'; };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
          else { fallbackCopy(txt); done(); }
        } else if (act === 'print') {
          window.print();
        } else if (act === 'save') {
          var saved = saveChoices(plan);
          msg.textContent = saved.length ? 'Saved to your Paw Plan: ' + saved.join(', ') + '.' : 'Nothing new to save. Your plan already lists these courses.';
        }
      });
    });
  }
  function fallbackCopy(txt) {
    var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }
  function saveChoices(plan) {
    var n = [], done = {};
    plan.items.forEach(function (it) {
      var s = it.slot;
      if (s.kind !== 'choice' || done[s.ci]) return;
      var codes = plan.items.filter(function (x) { return x.slot === s; }).map(function (x) { return x.code; });
      var code = codes.join(' + ');
      if (code === s.label) return;
      done[s.ci] = 1;
      if (B.setSlotCourse(s.si, s.ci, code, it.info.lt || it.info.t || '')) n.push(code);
    });
    plan.open.forEach(function (o) {
      if (!o.pick || o.slot.label === o.pick.code) return;
      if (B.setSlotCourse(o.slot.si, o.slot.ci, o.pick.code, o.pick.title)) n.push(o.pick.code);
    });
    return n;
  }

  // ---------- audit view: the first screen after upload ----------
  // Looks like the degree audit. Every remaining requirement in the plan is a red X with a
  // "Choose" button; picking a course and section writes it into the plan's spring semester
  // (moving it from a later term if needed) and marks the row as planned.
  var SECTION_NAMES = [['1', 'Orientation'], ['2', 'Communications & Tech Fluency'], ['3', 'Mathematical Sciences'], ['4', 'Natural Sciences'],
    ['5', 'Dept Course Requirements'], ['6', 'Restricted Electives'], ['8', 'General Education Program (GEP) Courses'], ['20', 'Free Electives']];
  var CAT_TO_SEC = { orientation: '1', comm: '2', math: '3', natsci: '4', dept: '5', restricted: '6', gep: '8', free: '20' };
  var av = { expanded: null, queries: {}, all: {}, lists: {}, rows: [], T: null, chips: {} };

  function openAudit() {
    injectStyle();
    syncStudent();
    var o = document.getElementById('pps-overlay');
    if (o) o.remove();
    o = document.createElement('div');
    o.id = 'pps-overlay';
    o.className = 'pps pps-audit';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.setAttribute('aria-labelledby', 'pps-title');
    var name = studentName();
    o.innerHTML = '<div class="pps-top"><div class="pps-top-in"><div><div class="pps-kicker">Paw Plan' + (name ? ' · ' + esc(name) : '') + '</div>' +
      '<h2 id="pps-title">' + esc(termLabel()) + ' Registration <span class="pps-beta">Beta</span></h2>' + termTabs() + '</div>' +
      '<div class="pps-topbtns"><button type="button" class="pps-back" data-av="plan">Four-year plan</button><button type="button" class="pps-x" aria-label="Close">&times;</button></div></div></div>' +
      '<div class="pps-body pps-avbody"><main class="pps-main pps-avmain"></main><aside class="pps-avside" aria-label="Your spring schedule"></aside></div>';
    document.body.appendChild(o);
    document.body.classList.add('pps-open');
    state.open = true;
    o.querySelector('.pps-x').addEventListener('click', close);
    o.querySelector('[data-av=plan]').addEventListener('click', close);
    o.querySelectorAll('[data-term]').forEach(function (b) { b.addEventListener('click', function () { state.chosen = b.getAttribute('data-term'); av.chips = {}; av.lists = {}; av.msg = ''; openAudit(); }); });
    o.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    o.querySelector('.pps-x').focus();
    var main = o.querySelector('.pps-avmain');
    if (!B.isUploaded()) { main.innerHTML = '<div class="pps-msg"><h3>Upload your degree audit first</h3><p>Close this window and click <strong>Upload New Degree Audit</strong>. Your audit opens here after it loads.</p></div>'; return; }
    main.innerHTML = '<div class="pps-msg"><h3>Loading ' + esc(termLabel()) + ' classes...</h3></div>';
    ensureData(function (err) {
      if (err) { main.innerHTML = '<div class="pps-msg"><h3>Could not load the class schedule</h3><p>Check your connection and try again.</p></div>'; return; }
      av.expanded = null; av.queries = {}; av.all = {};
      renderAudit();
    });
  }

  function engPrefs() { var p = state.prefs; return { earliest: +p.earliest || 0, latest: +p.latest || 0, noFriday: !!p.noFriday, online: p.online, busy: p.busy, includeConsent: !!p.includeConsent, full: fullSet() }; }
  // Sections a student found full in MyPack. Saved on the plan course (c.schedFull) so they travel
  // with the plan and its autosave; the class data is a snapshot, so seat counts go stale.
  function fullSet() {
    var o = {};
    (B.getPlan() || []).forEach(function (sem) { (sem.courses || []).forEach(function (c) { (c.schedFull || []).forEach(function (k) { o[k] = 1; }); }); });
    return o;
  }
  function fullList() {
    var out = [];
    (B.getPlan() || []).forEach(function (sem) { (sem.courses || []).forEach(function (c) { (c.schedFull || []).forEach(function (k) { out.push({ c: c, key: k }); }); }); });
    return out;
  }
  // "Section full": mark it, then swap in the best backup that still fits (same time first).
  // With no backup, the pick is cleared and the choices for that requirement open.
  function markFull(r, i) {
    var c = r.c, u = r.units[i], code = c.sched.codes[i] || c.code, key = av.T.unitKey(u);
    var rows = av.rows || [], occ = meetingsOf(rows, r).concat(r.units.filter(function (x, j) { return x && j !== i; }).reduce(function (m, x) { return m.concat(x.meetings); }, []));
    var full = fullSet(); full[key] = 1;
    var T2 = E.toolkit(state.index, B.getPlan(), B.lists, Object.assign(engPrefs(), { full: full }), engInput());
    var bk = T2.backups(code, u, occ).filter(function (b) { return !T2.caveat(b.unit); });
    var next = bk[0];
    B.commit(function () {
      c.schedFull = (c.schedFull || []).concat(c.schedFull && c.schedFull.indexOf(key) !== -1 ? [] : [key]);
      if (next) { c.sched.nbrs[i] = T2.unitKey(next.unit); return; }
      if (c.schedOrigCode) { c.code = c.schedOrigCode; c.name = c.schedOrigName || 'Click to choose'; if (c.schedOrigUnits) c.units = c.schedOrigUnits; }
      delete c.schedOrigCode; delete c.schedOrigName; delete c.schedOrigUnits; delete c.sched;
    });
    av.rowMsg = { k: rowKey(c) };
    if (next) av.msg = code + ': swapped #' + key + ' for #' + T2.unitKey(next.unit) + (next.same ? ' (same time).' : ' (' + meetText(next.unit) + ').') + ' Update your shopping cart.';
    else { av.msg = 'No other section of ' + code + ' fits. Pick another time or course below.'; av.expanded = rowKey(c); }
    av.rowMsg.t = av.msg;
  }
  function unmarkFull(k) {
    B.commit(function (plan) { plan.forEach(function (sem) { (sem.courses || []).forEach(function (c) { if (c.schedFull) { c.schedFull = c.schedFull.filter(function (x) { return x !== k; }); if (!c.schedFull.length) delete c.schedFull; } }); }); });
  }
  function engInput() { return { transferred: B.getTransferred(), standing: state.prefs.standing || undefined, gpa: B.getAuditGpa() }; }
  function secOf(c) {
    var a = String(c.auditSection || '');
    for (var i = 0; i < SECTION_NAMES.length; i++) if (SECTION_NAMES[i][0] === a) return a;
    return CAT_TO_SEC[c.cat] || '20';
  }
  function rowKey(c) { if (!c._avk) c._avk = 'k' + Math.random().toString(36).slice(2, 9); return c._avk; }
  function findCourse(plan, c) {
    for (var si = 0; si < plan.length; si++) { var ci = plan[si].courses.indexOf(c); if (ci !== -1) return { si: si, ci: ci }; }
    return null;
  }
  function pickedUnits(T, c) {
    if (!c.sched || !c.sched.nbrs) return [];
    return c.sched.nbrs.map(function (key, i) { return T.findUnit(c.sched.codes[i] || c.code, key); });
  }

  function collectRows(plan, T) {
    var term = state.index.term, tr = E.termRank(term), rows = [];
    plan.forEach(function (s, si) {
      var r = E.termRank(s.term);
      var named = /^(Completed NC State|Prior NC State|Transfer|In Progress)/.test(s.term);
      var prior = named || (r !== null && r < tr);
      var future = !named && r !== null && r >= tr;
      s.courses.forEach(function (c) {
        // Planning summer after spring: spring slots not picked yet are still choices.
        var earlierPick = prior && !named && !!c.sched;
        var earlierOpen = prior && !named && !c.sched && !c.importedFromAudit && c.classification !== 'planned_current' && c.auditStatus !== 'planned_current' && !c.transferPlan;
        if (earlierOpen) { rows.push({ sec: secOf(c), status: 'need', c: c, term: s.term, suggested: false, units: [] }); return; }
        if (earlierPick) { rows.push({ sec: secOf(c), status: 'inprog', c: c, term: s.term, pickedEarlier: true }); return; }
        if (prior) {
          if (c.classification === 'advisor_review' || c.classification === 'non_degree') return;
          var inprog = c.classification === 'planned_current' || /^In Progress/.test(s.term) || (!named && r < tr);
          rows.push({ sec: secOf(c), status: inprog ? 'inprog' : 'done', c: c, term: s.term });
        } else if (future) {
          if (c.transferPlan) { rows.push({ sec: secOf(c), status: 'transfer', c: c, term: s.term }); return; }
          var met = T.satisfiedBy(c);
          if (met) { rows.push({ sec: secOf(c), status: 'done', c: c, term: s.term, metBy: met }); return; }
          var planned = s.term === term && c.sched && c.sched.term === term;
          var otherSession = planned && state.tab && state.tab.session && c.sched.session && c.sched.session !== state.tab.session;
          if (otherSession) { rows.push({ sec: secOf(c), status: 'inprog', c: c, term: (SUMMER_TABS.filter(function (x) { return x[0] === c.sched.session; })[0] || [0, s.term])[1], pickedEarlier: true }); return; }
          rows.push({ sec: secOf(c), status: planned ? 'planned' : 'need', c: c, term: s.term, suggested: s.term === term && !planned, units: planned ? pickedUnits(T, c) : [] });
        }
      });
    });
    return rows;
  }
  function meetingsOf(rows, except) {
    var m = [];
    rows.forEach(function (r) { if (r !== except && r.status === 'planned') r.units.forEach(function (u) { if (u) m = m.concat(u.meetings); }); });
    return m;
  }
  function usedFor(rows, row, T) {
    var used = {};
    rows.forEach(function (r) {
      if (r === row) return;
      if (r.status === 'planned' || r.pickedEarlier) ((r.c.sched && r.c.sched.codes) || []).forEach(function (x) { used[x] = 1; });
      // Planned at another school: its NC State equivalent and the requirement's other courses are spoken for.
      if (r.status === 'transfer' && r.c.transferPlan) {
        var te = r.c.transferPlan.kind === 'nccc' ? ccEntry(r.c.transferPlan.course) : null;
        (te ? te.ncsu : []).forEach(function (x) { used[x] = 1; });
        var tsl = T.slotOf(Object.assign({}, r.c, { transferPlan: null }));
        if (tsl.kind === 'fixed' || tsl.kind === 'choice') tsl.options.forEach(function (o) { o.forEach(function (x) { used[x] = 1; }); });
      }
      // A core requirement not chosen yet keeps all of its courses: the audit counts the first
      // ARE 303 or 304 a student takes toward the core line. Once the core row has its pick
      // (or is already met), the other course is free to be an ARE elective.
      if (r.status === 'need') {
        var sl = T.slotOf(r.c);
        if (sl.kind === 'fixed' || sl.kind === 'choice') sl.options.forEach(function (o) { o.forEach(function (x) { used[x] = 1; }); });
      }
    });
    return used;
  }
  // ARE 490 goes in one of the last three regular semesters with coursework (Paw Plan's own rule).
  function are490Lock(row) {
    if (!/^ARE 490$/.test(String(row.c.schedOrigCode || row.c.code)) || row.suggested || row.status === 'planned') return '';
    return lastThree() ? '' : 'ARE 490 belongs in one of your last three semesters';
  }
  // Close to graduating: if the requirements left after this term are few, say what finishing
  // this term would take.
  function finishNote(rows, term) {
    if (isSummer()) return '';
    var now = rows.filter(function (r) { return (r.status === 'planned' || (r.status === 'need' && r.suggested)) && !(r.c.schedExtra && r.status === 'need'); });
    var later = rows.filter(function (r) { return r.status === 'need' && !r.suggested && !r.c.schedExtra; });
    if (!later.length || later.length > 3) return '';
    var cr = function (list) { return list.reduce(function (t, r) { return t + (Number(r.c.units) || 0); }, 0); };
    var total = cr(now) + cr(later);
    if (total > 21) return '';
    var names = later.map(function (r) { return r.c.schedOrigCode || r.c.code; }).join(', ');
    return '<p class="pps-finish">' + (ADVISOR ? 'The student could' : 'You could') + ' finish in ' + esc(termLabel()) + '. Paw Plan left ' + cr(later) + ' credit' + (cr(later) === 1 ? '' : 's') + ' for a later term (' + esc(names) + '). Choosing ' + (later.length === 1 ? 'it' : 'them') + ' for ' + esc(termLabel()) + ' makes ' + total + ' credits' +
      (total > 18 ? ', which needs an overload approval.' : '.') + '</p>';
  }
  function lastThree() {
    var tr = E.termRank(state.index.term), later = 0;
    B.getPlan().forEach(function (s) {
      var r = E.termRank(s.term);
      if (r !== null && r > tr && !B.isSummerTerm(s.term) && (s.courses || []).some(function (c) { return !c.schedExtra; })) later++;
    });
    return later <= 2;
  }
  // A requirement Paw Plan placed in a later semester that the student could take this term:
  // offered, prerequisites done, and a section fits the other picks.
  function readyNow(r, rows, T) {
    if (r.status !== 'need' || r.suggested || are490Lock(r)) return false;
    var sl = T.slotOf(r.c);
    if (sl.kind !== 'fixed' && sl.kind !== 'choice') return false;
    var ch = T.choices(r.c, meetingsOf(rows, r), usedFor(rows, r, T));
    return ch.fits.some(function (e) { return !e.warnLevel && !e.restrictedOnly && !e.studyAbroad; });
  }

  function renderAudit() {
    var o = document.getElementById('pps-overlay');
    if (!o || !o.classList.contains('pps-audit')) return;
    var main = o.querySelector('.pps-avmain'), side = o.querySelector('.pps-avside');
    var scroll = main.scrollTop;
    var plan = B.getPlan(), term = state.index.term;
    if (!plan.some(function (s) { return s.term === term; })) {
      main.innerHTML = '<div class="pps-msg"><h3>No ' + esc(termLabel()) + ' semester in this plan</h3><p>Paw Plan did not place any courses in ' + esc(termLabel()) + '. Check the planning start term you confirmed when you uploaded the audit.</p></div>';
      side.innerHTML = ''; return;
    }
    var T = av.T = E.toolkit(state.index, plan, B.lists, engPrefs(), engInput());
    var rows = av.rows = collectRows(plan, T);
    rows.forEach(function (r) { r.ready = readyNow(r, rows, T); });
    var n = { done: 0, inprog: 0, planned: 0, need: 0, transfer: 0 };
    rows.forEach(function (r) { if (!(r.c.schedExtra && r.status === 'need')) n[r.status]++; });
    var h = '<div class="pps-avhead"><p class="pps-source">This is ' + (ADVISOR ? 'the student\'s' : 'your') + ' degree audit with ' + esc(termLabel()) + ' planning built in. Click <strong>Choose for ' + esc(termLabel()) + '</strong> on any red X to see every course that fills it, with times that fit ' + (ADVISOR ? 'their' : 'your') + ' other picks. Picks are saved to Paw Plan.</p><p class="pps-stale">' + esc(staleNote()) + '</p>' +
      '<div class="pps-counts"><span class="st-done">&#10003; ' + n.done + ' complete</span><span class="st-inprog">&#9670; ' + n.inprog + ' in progress</span><span class="st-planned">&#9733; ' + n.planned + ' planned for ' + esc(termLabel()) + '</span>' + (n.transfer ? '<span class="st-transfer">&#8644; ' + n.transfer + ' planned at another school</span>' : '') + '<span class="st-need">&#10007; ' + n.need + ' still needed after ' + esc(termLabel()) + '</span></div></div>';
    h += finishNote(rows, term);
    SECTION_NAMES.forEach(function (sec) {
      var list = rows.filter(function (r) { return r.sec === sec[0]; });
      var gep = sec[0] === '8' ? gepVerifyRows(rows) : [];
      if (!list.length && !gep.length) return;
      var open = list.some(function (r) { return r.status === 'need' || r.status === 'planned' || r.status === 'transfer'; }) || gep.some(function (g) { return g.status !== 'done'; });
      h += '<section class="pps-avsec"><h3><span class="pps-ic ' + (open ? 'st-need' : 'st-done') + '">' + (open ? '&#10007;' : '&#10003;') + '</span>' + esc(sec[1]) + '</h3><div class="pps-avrows" role="table">';
      var order = { planned: 0, need: 1, transfer: 2, inprog: 3, done: 4 };
      list.sort(function (a, b) { return order[a.status] - order[b.status] || (b.suggested ? 1 : 0) - (a.suggested ? 1 : 0) || (b.ready ? 1 : 0) - (a.ready ? 1 : 0); });
      list.forEach(function (r) { h += rowHtml(r, rows, T); });
      gep.forEach(function (g) {
        var gk = 'gep-' + g.id, open = av.expanded === gk;
        h += '<div class="pps-avrow st-row-' + g.status + (open ? ' on' : '') + '" role="row"><span class="pps-ic st-' + g.status + '">' + { done: '&#10003;', planned: '&#9733;', need: '&#10007;' }[g.status] + '</span><div class="pps-avcls"><strong>' + esc(g.label) + '</strong> <span class="pps-muted">' + esc(g.text) + '</span></div>' +
          (g.status === 'need' ? '<div class="pps-avact"><button type="button" class="pps-btn pps-btn-sm" data-choose="' + gk + '" aria-expanded="' + open + '">' + (open ? 'Close' : 'Choose for ' + esc(termLabel())) + '</button></div>' : '') + '</div>';
        if (open && g.status === 'need') h += gepPanel(g, rows, T);
      });
      h += '</div></section>';
    });
    main.innerHTML = h;
    main.scrollTop = scroll;
    side.innerHTML = sideHtml(rows, T);
    av.msg = null; av.rowMsg = null; // shown once
    wireAudit(o, rows, T);
  }

  // Courses that count for Global Knowledge or American Democracy AND fill one of the student's
  // open requirements (Humanities, Social Science, electives). Picking one fills that requirement.
  function gepPanel(g, rows, T) {
    var key = 'gep-' + g.id, list = [], seen = {}, excl = {};
    (B.lists.FREE_EXCLUDED || []).forEach(function (x) { excl[x] = 1; });
    var targets = rows.filter(function (r) { return r.status === 'need' && !are490Lock(r); })
      .sort(function (a, b) { return (b.suggested ? 1 : 0) - (a.suggested ? 1 : 0); });
    targets.forEach(function (r) {
      var sl = T.slotOf(r.c);
      if (sl.kind !== 'open' && !sl.isFree) return;
      var occ = meetingsOf(rows, r), used = usedFor(rows, r, T), ents;
      if (sl.isFree || r.c.schedExtra) ents = T.search('', occ, used, 400, function (x) { return g.set[x] && !excl[x]; });
      else ents = T.choices(r.c, occ, used).fits.filter(function (e) { return e.option.every(function (x) { return g.set[x]; }); });
      ents.forEach(function (e) {
        if (seen[e.code]) return;
        seen[e.code] = 1;
        list.push(Object.assign({}, e, { rowKey: rowKey(r.c), fills: r.c.schedExtra ? 'an extra class' : (r.c.schedOrigCode || r.c.code) }));
      });
    });
    list.sort(function (a, b) { return ((a.studyAbroad ? 2 : a.restrictedOnly ? 1 : 0) - (b.studyAbroad ? 2 : b.restrictedOnly ? 1 : 0)) || ((a.warn ? 1 : 0) - (b.warn ? 1 : 0)) || (a.code < b.code ? -1 : 1); });
    // Courses that count but fill none of the student's open requirements: offered as an extra class.
    var occAll = meetingsOf(rows, null), usedAll = usedFor(rows, null, T);
    T.search('', occAll, usedAll, 400, function (x) { return g.set[x] && !seen[x]; }).forEach(function (e) {
      list.push(Object.assign({}, e, { makeExtra: true, fills: 'an extra class (no open requirement)' }));
    });
    av.lists[key] = list;
    var h = '<div class="pps-choose" role="region" aria-label="Courses for ' + esc(g.label) + '">';
    if (!list.length) return h + '<p class="pps-muted">No course that counts for ' + esc(g.label) + ' fits one of your open requirements in ' + esc(termLabel()) + '. Ask your advisor, or use "+ Add another class" to take one beyond your requirements.</p></div>';
    var shown = av.all[key] ? list : list.slice(0, 10);
    h += '<p class="pps-muted">Each course below counts for ' + esc(g.label) + ' and fills the requirement shown.</p><ol class="pps-entries">' + shown.map(function (e, ei) { return entryHtml(e, ei, key); }).join('') + '</ol>';
    if (list.length > shown.length) h += '<button type="button" class="pps-link" data-allfor="' + key + '">Show all ' + list.length + '</button>';
    return h + '</div>';
  }
  function gepVerifyRows(rows) {
    var L = B.lists, out = [];
    [['GEP Global Knowledge', L.VERIFY_GLOBAL_KNOWLEDGE, 'Global Knowledge', 'gk'], ['Found. of American Democracy', L.VERIFY_AMER_DEMOCRACY, 'American Democracy', 'ad']].forEach(function (g) {
      var set = {}; (g[1] || []).forEach(function (x) { set[x] = 1; });
      var done = rows.filter(function (r) { return (r.status === 'done' || r.status === 'inprog') && set[r.c.code]; })[0];
      var plan = rows.filter(function (r) { return r.status === 'planned' && (r.c.sched.codes || []).some(function (x) { return set[x]; }); })[0];
      // The audit lists an unmet Global Knowledge / American Democracy line only when it is still needed.
      var model = window.pawPlanLastAuditModel, fr = model && model.sections && model.sections.futureRequirements;
      var auditMet = fr && !fr.some(function (it) { return it.requirementKind === (g[3] === 'gk' ? 'GEP Global Knowledge' : 'American Democracy'); });
      if (!done && auditMet) { out.push({ id: g[3], label: g[0], status: 'done', text: 'Met on your degree audit.' }); return; }
      if (done) out.push({ id: g[3], label: g[0], status: 'done', text: 'Met by ' + done.c.code + '. Verify on the audit.' });
      else if (plan) out.push({ id: g[3], label: g[0], status: 'planned', text: 'Planned: ' + plan.c.sched.codes.join(' + ') + ' also counts.' });
      else out.push({ id: g[3], label: g[0], status: 'need', set: set, text: 'Not a separate class: take a course that counts for it while filling another requirement, such as Humanities or an elective.' });
    });
    return out;
  }

  // How a requirement reads on the audit view (department rules: ARE 301, never EC 301).
  function dispCode(code) { return code === 'EC/ARE 301' ? 'ARE 301' : code; }
  // Department substitutions that fill this requirement (ARE 255 for AEE 226), named on the row.
  function subNote(r, T) {
    if (r.status !== 'need') return '';
    var subs = T.subs || {}, code = r.c.schedOrigCode || r.c.code, out = [];
    Object.keys(subs).forEach(function (orig) { if (code.indexOf(orig) !== -1) out = out.concat(subs[orig]); });
    return out.length ? out.join(' or ') + ' also counts for this requirement' : '';
  }
  function rowHtml(r, rows, T) {
    var c = r.c, key = rowKey(c), term = state.index.term;
    var icon = { done: '&#10003;', inprog: '&#9670;', planned: '&#9733;', need: '&#10007;', transfer: '&#8644;' }[r.status];
    var label = r.status === 'planned' || r.pickedEarlier ? c.code : c.schedExtra ? 'Extra class' : dispCode(c.schedOrigCode || c.code);
    var title = r.metBy ? '' : r.status === 'done' || r.status === 'inprog' ? courseTitle(c.code) : (r.status === 'planned' ? courseTitle(c.code) : c.schedExtra ? 'Any course, beyond your requirements' : (c.tag || ''));
    var right = '';
    if (r.metBy) right = '<span class="pps-avterm">Met by ' + esc(r.metBy) + '</span>';
    else if (r.status === 'done') right = '<span class="pps-avterm">' + esc(/Transfer/.test(r.term) ? 'Transfer / test credit' : 'Complete') + '</span>';
    else if (r.status === 'transfer') right = '<span class="pps-badge">At another school</span><button type="button" class="pps-link" data-untransfer="' + key + '">Undo</button>';
    else if (r.status === 'inprog') right = '<span class="pps-avterm">' + (r.pickedEarlier ? 'Picked for ' : 'In progress · ') + esc(r.term) + '</span>';
    else if (r.status === 'need' && c.schedExtra) {
      right = '<button type="button" class="pps-btn pps-btn-sm" data-choose="' + key + '" aria-expanded="' + (av.expanded === key) + '">' + (av.expanded === key ? 'Close' : 'Choose a class') + '</button><button type="button" class="pps-link" data-remove="' + key + '">Remove</button>';
    }
    else if (r.status === 'need') {
      var lock = are490Lock(r);
      right = (r.suggested ? '<span class="pps-badge good">Suggested for ' + esc(termLabel()) + '</span>' : '<span class="pps-avterm">In your plan for ' + esc(r.term) + '</span>' +
        (r.ready ? '<span class="pps-badge good">Open to you in ' + esc(termLabel()) + '</span>' : '')) +
        (lock ? '<span class="pps-muted">' + esc(lock) + '</span>' : '<button type="button" class="pps-btn pps-btn-sm" data-choose="' + key + '" aria-expanded="' + (av.expanded === key) + '">' + (av.expanded === key ? 'Close' : 'Choose for ' + esc(termLabel())) + '</button>') +
        (r.suggested ? '<button type="button" class="pps-link" data-skip="' + key + '">Not this term</button>' : '') +
        (aREOnly(c) ? '' : '<button type="button" class="pps-link" data-elsewhere="' + key + '">Taking it at another school</button>');
    } else {
      right = '<span class="pps-badge">Planned ' + esc(termLabel()) + '</span><button type="button" class="pps-link" data-choose="' + key + '">' + (av.expanded === key ? 'Close' : 'Change') + '</button><button type="button" class="pps-link" data-remove="' + key + '">Remove</button>';
    }
    var h = '<div class="pps-avrow st-row-' + r.status + (av.expanded === key ? ' on' : '') + '" role="row"><span class="pps-ic st-' + r.status + '">' + icon + '</span>' +
      '<div class="pps-avcls"><strong>' + esc(label) + '</strong>' + (title ? ' <span>' + esc(title) + '</span>' : '') + ' <span class="pps-muted">' + esc(String(c.units || '')) + ' cr' +
      (r.status === 'planned' && c.schedExtra ? ' \u00b7 extra class' : r.status === 'planned' && c.schedOrigCode && c.schedOrigCode !== c.code ? ' \u00b7 fills ' + esc(c.schedOrigCode) : '') + '</span>';
    if (av.rowMsg && av.rowMsg.k === key) h += '<div class="pps-flag good" role="status">' + esc(av.rowMsg.t) + '</div>';
    var sn = subNote(r, T);
    if (sn) h += '<div class="pps-subnote">' + esc(sn) + ' (department substitution).</div>';
    if (r.metBy) {
      var isSub = Object.keys(T.subs || {}).some(function (k) { return (T.subs[k] || []).indexOf(r.metBy) !== -1; });
      h += '<div class="pps-muted">' + esc(r.metBy) + ' counts for this requirement' + (isSub ? ' (department substitution)' : '') + '. Confirm it shows on the audit; ask your advisor if it does not.</div>';
    }
    if (r.status === 'transfer') {
      var tp = c.transferPlan;
      var chk = ccCheck(c, tp);
      h += '<div class="pps-when">' + esc([tp.school || 'Another school', tp.course, tp.termLabel || tp.term].filter(Boolean).join(' \u00b7 ')) + '</div>' +
        (chk ? '<div class="pps-flag ' + (chk.level === 'ok' ? 'good' : chk.level === 'stop' ? 'warn' : '') + '">' + esc(chk.text) + '</div>' : '') +
        (!chk || chk.level !== 'ok' ? '<div>' + dbLink() + '</div>' : '') +
        '<div class="pps-muted">' + (chk && chk.level === 'ok' ? 'Guides can change, so ' + (ADVISOR ? 'confirm' : 'confirm with your advisor') + ' before enrolling.' : (ADVISOR ? 'Confirm' : 'Confirm with your advisor') + ' that this course transfers to NC State as ' + esc(label) + ' before enrolling.') + '</div>';
    }
    if (r.status === 'planned') {
      if (r.units.some(function (u) { return !u; })) h += '<div class="pps-flag warn">That section is no longer offered. Choose again.</div>';
      else h += r.units.map(function (u, i) { var cv = u && T.caveat(u); return '<div class="pps-when">' + esc(meetText(u)) + '</div>' + secLines(u) + (cv ? '<div class="pps-flag warn">' + esc(cv) + '</div>' : '') +
        '<button type="button" class="pps-link pps-fullbtn" data-full="' + key + ':' + i + '">Full in MyPack? Swap in a backup</button>'; }).join('') + plannedExtras(r, rows, T);
    }
    h += '</div><div class="pps-avact">' + right + '</div></div>';
    if (av.expanded === key && (r.status === 'need' || r.status === 'planned')) h += choosePanel(r, rows, T);
    if (av.elsewhere === key && r.status === 'need') h += elsewhereForm(r);
    return h;
  }
  // Requirements with an ARE option (ARE 336, EC/ARE 301, ARE electives) are taken in ARE at NC State,
  // so there is no "another school" option (ARE over Poole, and ARE courses do not transfer in).
  function aREOnly(c) {
    if (!av.T) av.T = E.toolkit(state.index, B.getPlan(), B.lists, engPrefs(), engInput());
    var sl = av.T.slotOf(Object.assign({}, c, { transferPlan: null }));
    if (sl.kind !== 'fixed' && sl.kind !== 'choice' && !/^ARE /.test(sl.label)) return false; // broad elective lists stay open
    return reqOptions(c).some(function (x) { return x.some(function (y) { return /^ARE /.test(y); }); });
  }
  function courseTitle(code) { var c = state.index.courses[code]; return c ? (c.info.lt || c.info.t || '') : ''; }

  function plannedExtras(r, rows, T) {
    var occ = meetingsOf(rows, r), h = '';
    var bk = r.units[0] ? T.backups(r.c.sched.codes[0] || r.c.code, r.units[0], occ) : [];
    r.backupCount = bk.length;
    if (bk.length) {
      h += '<details class="pps-backups"><summary>Backup sections (' + bk.length + ')</summary><ol>' + bk.slice(0, 8).map(function (b) {
        return '<li><div class="pps-bk-main">' + (b.same ? '<span class="pps-badge">Same time</span> ' : '') + secLines(b.unit) + '</div></li>';
      }).join('') + '</ol>' + (bk.length > 8 ? '<p class="pps-muted">' + (bk.length - 8) + ' more in the full schedule view.</p>' : '') + '</details>';
    } else h += '<div class="pps-nobk">No other section fits. Register for this one first.</div>';
    // If every section fills: core requirements still open that fit in its place.
    var alts = [];
    rows.forEach(function (o) {
      if (o === r || o.status !== 'need' || alts.length >= 3 || are490Lock(o)) return;
      var sl = T.slotOf(o.c);
      if (sl.kind !== 'fixed' && sl.kind !== 'choice') return;
      var ch = T.choices(o.c, occ, usedFor(rows, o, T));
      if (ch.fits.length) alts.push({ row: o, entry: ch.fits[0] });
    });
    if (alts.length) h += '<details class="pps-backups pps-pull"><summary>If every section fills: ' + alts.length + ' other requirement' + (alts.length === 1 ? '' : 's') + ' you could take instead</summary><ol>' +
      alts.map(function (a) { return '<li><div class="pps-bk-main"><strong>' + esc(a.entry.code) + '</strong> ' + esc(a.entry.title) + ' <span class="pps-muted">fills ' + esc(a.row.c.schedOrigCode || a.row.c.code) + ' (Paw Plan: ' + esc(a.row.term) + ')</span>' + secLines(a.entry.times[0].units[0]) + '</div></li>'; }).join('') + '</ol></details>';
    return h;
  }

  function timeChips(entry, ei, key, max) {
    var times = av.all[key + ':' + ei] ? entry.times : entry.times.slice(0, max || 4);
    return '<div class="pps-chips">' + times.map(function (t, ti) {
      var txt = t.units.map(function (u) { return meetText(u); }).join(' + ');
      return '<button type="button" class="pps-chip' + (t.viol.length ? ' viol' : '') + (t.restricted ? ' restr' : '') + '" data-pick="' + key + ':' + ei + ':' + ti + '" title="' + esc(t.restricted || (t.viol.length ? 'This time ' + violText(t.viol) : 'Pick this time')) + '">' + esc(txt) +
        '<span>' + (t.count > 1 ? t.count + ' sections' : '#' + t.units.map(function (u) { return u.sections.map(function (x) { return x.nbr; }).join('+'); }).join(' + ')) + '</span>' +
        (t.restricted ? '<em>' + esc(t.restricted) + '</em>' : '') + '</button>';
    }).join('') + (entry.times.length > times.length ? '<button type="button" class="pps-link" data-alltimes="' + key + ':' + ei + '">+' + (entry.times.length - times.length) + ' more times</button>' : '') + '</div>';
  }
  function fitText(e) {
    var r = e.restrictedFit || 0, n = e.sectionsFit;
    if (!r) return n + ' section' + (n === 1 ? '' : 's') + ' fit';
    if (!n) return r + ' section' + (r === 1 ? '' : 's') + ' fit, all with seat restrictions';
    return n + ' section' + (n === 1 ? '' : 's') + ' fit, plus ' + r + ' with seat restrictions';
  }
  function entryHtml(entry, ei, key) {
    var b = '';
    entry.alsoCounts.forEach(function (a) { b += ' <span class="pps-badge good">Also counts: ' + esc(a) + '</span>'; });
    if (entry.warn) b += ' <span class="pps-badge warn" title="' + esc(entry.warn) + '">Check prerequisite</span>';
    if (entry.offList) b += ' <span class="pps-badge warn">Not on the approved list; ask your advisor</span>';
    if (entry.fills) b += ' <span class="pps-badge good">Fills ' + esc(entry.fills) + '</span>';
    if (entry.studyAbroad) b += ' <span class="pps-badge">Study abroad: for students accepted into the program</span>';
    else if (entry.restrictedOnly) b += ' <span class="pps-badge warn">Seat restrictions: check before you pick</span>';
    Object.keys(av.T.subs || {}).forEach(function (orig) { if ((av.T.subs[orig] || []).indexOf(entry.code) !== -1) b += ' <span class="pps-badge good">Counts for ' + esc(orig) + ' (department substitution)</span>'; });
    return '<li><div class="pps-entry"><strong>' + esc(entry.code) + '</strong> ' + esc(entry.title) + b + ' <span class="pps-muted">' + fitText(entry) + '</span></div>' + timeChips(entry, ei, key) + hiddenHtml(entry.hidden) + '</li>';
  }

  var CHIPS = [['are', 'ARE courses'], ['online', 'Online'], ['mwf', 'Mon/Wed/Fri'], ['tth', 'Tue/Thu'], ['short', '1\u20132 credits']];
  function chipsHtml(key, chips) {
    return '<div class="pps-fchips" role="group" aria-label="Filter courses">' + CHIPS.map(function (c) {
      return '<button type="button" class="pps-fchip' + (chips[c[0]] ? ' on' : '') + '" aria-pressed="' + !!chips[c[0]] + '" data-fchip="' + key + ':' + c[0] + '">' + c[1] + '</button>';
    }).join('') + '</div>';
  }
  // Keep only the times (and courses) that match the chips.
  function applyChips(list, chips) {
    var dayOk = function (u, set) { return u.meetings.length > 0 && u.meetings.every(function (m) { return m.days.every(function (d) { return set.indexOf(d) !== -1; }); }); };
    var tOk = function (t) {
      return t.units.every(function (u) {
        if (chips.online && !u.online) return false;
        if (chips.mwf && !dayOk(u, [0, 2, 4])) return false;
        if (chips.tth && !dayOk(u, [1, 3])) return false;
        return true;
      });
    };
    return list.filter(function (e) {
      if (chips.are && !e.option.every(function (x) { return /^ARE /.test(x); })) return false;
      if (chips.short && !(parseFloat(String(((e.times[0] || {}).units || [{}])[0].units || '3')) <= 2)) return false;
      return true;
    }).map(function (e) {
      if (!chips.online && !chips.mwf && !chips.tth) return e;
      var ft = e.times.filter(tOk);
      if (!ft.length) return null;
      var n = ft.reduce(function (t, x) { return t + (x.restricted ? 0 : x.count); }, 0);
      return Object.assign({}, e, { times: ft, sectionsFit: n, restrictedFit: ft.reduce(function (t, x) { return t + (x.restricted ? x.count : 0); }, 0), restrictedOnly: !n });
    }).filter(Boolean);
  }
  // On a summer tab, a course "not offered" here may run in the other session.
  function otherSessionWhy(e) {
    if (!state.tab || !state.tab.sessions || !state.sessionsOf || e.option.length !== 1) return e;
    var ses = state.sessionsOf[e.option[0]];
    if (!ses) return e;
    var other = SUMMER_TABS.filter(function (x) { return x[0] !== state.tab.session && x[2].some(function (k) { return ses[k]; }); })[0];
    return other ? Object.assign({}, e, { why: 'Offered in ' + other[1] + ', not ' + state.tab.label.replace(/ \d{4}$/, '') + '. Switch to the ' + other[1] + ' tab to pick it.' }) : e;
  }
  function choosePanel(r, rows, T) {
    var key = rowKey(r.c), occ = meetingsOf(rows, r), used = usedFor(rows, r, T);
    var ch = T.choices(r.c, occ, used), term = state.index.term;
    var h = '<div class="pps-choose" role="region" aria-label="Courses for ' + esc(r.c.schedOrigCode || r.c.code) + '">';
    if (ch.note) return h + '<p>This is not a specific course, so it cannot be scheduled here. Talk with your advisor about what fills it.</p></div>';
    var q = av.queries[key] || '', list;
    if (ch.free || ch.fits.length > 8) h += '<div class="pps-search"><input type="search" data-q="' + key + '" value="' + esc(q) + '" placeholder="' + (ch.free ? 'Search a subject (like PSY) or a word in a course title' : 'Filter by code or title') + '" aria-label="Search courses"></div>';
    // Filter chips: free electives open on ARE courses so there is something to browse right away.
    var chips = av.chips[key] || (av.chips[key] = ch.free ? { are: 1, _free: 1 } : {});
    var anyChip = Object.keys(chips).some(function (k) { return k.charAt(0) !== '_' && chips[k]; });
    if (ch.free || ch.slot.kind === 'open' || ch.fits.length > 8) h += chipsHtml(key, chips);
    if (ch.free) {
      // Courses on Paw Plan's excluded list (FREE_EXCLUDED) cannot be free electives.
      var excl = {};
      (B.lists.FREE_EXCLUDED || []).forEach(function (x) { excl[x] = 1; });
      var okFree = function (code) { return !excl[code] && (!chips.are || /^ARE /.test(code)); };
      if (q.length >= 2) list = T.search(q, occ, used, 60, okFree);
      else if (anyChip) list = T.search('', occ, used, chips.are ? 80 : 400, okFree);
      else list = [];
    } else {
      list = ch.fits;
      if (q.length >= 2) {
        var ql = q.toLowerCase();
        list = list.filter(function (e) { return (e.code + ' ' + e.title).toLowerCase().indexOf(ql) !== -1; });
        if (!list.length && ch.slot.kind === 'open') list = T.search(q, occ, used, 15).map(function (e) { e.offList = true; return e; });
      }
    }
    list = applyChips(list, chips);
    // Free electives: subject-code matches first, then 300-400 level, then no prerequisite flag.
    var qU = q.trim().toUpperCase();
    var lvl = function (e) { var m = e.code.match(/ (\d)/); return m && +m[1] >= 3 ? 0 : 1; };
    if (ch.free) list.sort(function (a, b) {
      return ((a.studyAbroad ? 2 : a.restrictedOnly ? 1 : 0) - (b.studyAbroad ? 2 : b.restrictedOnly ? 1 : 0)) ||
        (qU.length >= 2 ? (b.code.indexOf(qU) === 0 ? 1 : 0) - (a.code.indexOf(qU) === 0 ? 1 : 0) : 0) ||
        lvl(a) - lvl(b) || ((a.warn ? 1 : 0) - (b.warn ? 1 : 0)) || (a.code < b.code ? -1 : 1);
    });
    if (!list.length) {
      if (ch.free) h += '<p class="pps-muted">' + (q.length >= 2 || anyChip ? 'Nothing that fits your other picks with those filters. Try another filter or search.' : 'Almost any course counts as a free elective. Search for one, or turn on a filter to browse.') + '</p>';
      else h += '<p class="pps-muted">' + (q || anyChip ? 'Nothing that fits with those filters.' : 'No course for this requirement fits ' + term + ' right now.') + '</p>';
    }
    // ARE 303 or 304 (and the other core choices) wait for their core row; say so on elective rows.
    if (ch.slot.kind === 'open' && ch.slot.pool) {
      var inPool = {}, heldReqs = [];
      ch.slot.pool.options.forEach(function (o) { if (o.length === 1) inPool[o[0]] = 1; });
      rows.forEach(function (o) {
        if (o === r || o.status !== 'need') return;
        var sl = T.slotOf(o.c);
        if (sl.kind !== 'choice') return;
        var lbl = dispCode(o.c.schedOrigCode || o.c.code);
        if (heldReqs.indexOf(lbl) === -1 && sl.options.some(function (x) { return x.length === 1 && inPool[x[0]] && !T.ctx.taken[x[0]]; })) heldReqs.push(lbl);
      });
      if (heldReqs.length) h += '<p class="pps-muted">Courses that fill a core choice (' + esc(heldReqs.join(', ')) + ') count toward that core row first. Once you choose one there, another course from that requirement can count as an elective here.</p>';
    }
    av.lists[key] = list;
    var shown = av.all[key] ? list : list.slice(0, 10);
    if (shown.length) h += '<ol class="pps-entries">' + shown.map(function (e, ei) { return entryHtml(e, ei, key); }).join('') + '</ol>';
    if (list.length > shown.length) h += '<button type="button" class="pps-link" data-allfor="' + key + '">Show all ' + list.length + '</button>';
    var unavailable = ch.locked.concat(ch.noFit);
    if (ch.slot.kind !== 'open') unavailable = unavailable.concat(ch.notOffered.map(otherSessionWhy));
    if (unavailable.length) h += '<div class="pps-unavail"><div class="pps-flabel">Not available for ' + esc(termLabel()) + '</div><ul>' + unavailable.slice(0, 12).map(function (e) { return '<li><strong>' + esc(e.code) + '</strong> ' + esc(e.why) + hiddenHtml(e.hidden) + '</li>'; }).join('') + '</ul>' +
      (unavailable.length > 12 ? '<p class="pps-muted">' + (unavailable.length - 12) + ' more not available.</p>' : '') + '</div>';
    return h + '</div>';
  }

  function summerSplit(planned) {
    var by = {};
    planned.forEach(function (r) { var k = sessionText(r.units[0]) || 'Summer'; by[k] = (by[k] || 0) + (Number(r.c.units) || 0); });
    var keys = Object.keys(by);
    return keys.length ? '<div class="pps-muted">' + keys.map(function (k) { return esc(k) + ': ' + by[k] + ' cr'; }).join(' \u00b7 ') + '</div>' : '';
  }
  // Elective credits still to take before graduating, and how many this term's picks cover.
  var ELECTIVE_GROUPS = [['ARE electives', /^ARE 4XX|^ARE Elective/], ['Technical', /^Technical Elective/], ['Dept or Technical', /^Dept or Technical/],
    ['Free', /^Free Elective/], ['Natural Science', /^Natural Science/], ['GEP', /^GEP |^Social Science|^Interdisc|^HES/]];
  function electivesLeft(rows) {
    var out = ELECTIVE_GROUPS.map(function (g) { return { label: g[0], re: g[1], left: 0, picked: 0 }; });
    rows.forEach(function (r) {
      if (r.c.schedExtra || (r.status !== 'need' && r.status !== 'planned')) return;
      var lbl = String(r.c.schedOrigCode || r.c.code), cr = Number(r.c.schedOrigUnits || r.c.units) || 0;
      var g = out.filter(function (x) { return x.re.test(lbl); })[0];
      if (!g || !cr) return;
      g.left += cr;
      if (r.status === 'planned') g.picked += cr;
    });
    out = out.filter(function (g) { return g.left; });
    if (!out.length) return '';
    return '<div class="pps-elleft"><div class="pps-flabel">Electives left to graduate</div><table><thead><tr><th>Elective</th><th>Credits left</th><th>Picked this term</th></tr></thead><tbody>' +
      out.map(function (g) { return '<tr><td>' + esc(g.label) + '</td><td>' + g.left + '</td><td>' + (g.picked || '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function sideHtml(rows, T) {
    var term = state.index.term, planned = rows.filter(function (r) { return r.status === 'planned'; });
    var suggested = rows.filter(function (r) { return r.status === 'need' && r.suggested; });
    var cr = planned.reduce(function (t, r) { return t + (Number(r.c.units) || 0); }, 0);
    var scr = suggested.reduce(function (t, r) { return t + (Number(r.c.units) || 0); }, 0);
    var items = [];
    planned.forEach(function (r) { r.units.forEach(function (u, i) { if (u) items.push({ code: (r.c.sched.codes[i] || r.c.code), unit: u, slot: { cat: r.c.cat } }); }); });
    var h = '<div class="pps-avcredits"><div><strong>' + cr + '</strong> credits picked for ' + esc(termLabel()) + '</div>' +
      (scr ? '<div class="pps-muted">' + scr + ' more credits suggested and not picked yet</div>' : '') +
      (isSummer() ? summerSplit(planned) : cr > 18 ? '<div class="pps-flag warn">Above 18 credits needs an overload approval.</div>' : cr && cr < 12 && !scr ? '<div class="pps-flag">Below 12 credits is part-time.</div>' : '') +
      (av.msg ? '<div class="pps-flag' + (/Not filled|No other|Nothing to fill/.test(av.msg) ? ' warn' : ' good') + '" role="status">' + esc(av.msg) + '</div>' : '') + '</div>';
    h += electivesLeft(rows);
    if (suggested.length) h += '<button type="button" class="pps-btn pps-wide" data-av="auto">Choose times for me</button><p class="pps-muted pps-small">Picks a section that fits for each course marked "Suggested for ' + esc(termLabel()) + '." Electives you choose yourself. You can change any pick.</p>';
    h += '<button type="button" class="pps-btn pps-btn-ghost pps-wide" data-av="addx">+ Add another class</button>';
    h += calendar({ items: items, open: [] });
    if (planned.length) {
      var lines = [];
      planned.forEach(function (r) {
        var occ = meetingsOf(rows, r);
        r.units.forEach(function (u, i) {
          if (!u) return;
          var code = r.c.sched.codes[i] || r.c.code, bk = T.backups(code, u, occ);
          lines.push({ code: code, u: u, bk: bk, cv: T.caveat(u) });
        });
      });
      lines.sort(function (a, b) { return a.bk.length - b.bk.length; });
      av.lines = lines;
      h += '<div class="pps-mypack pps-avpack"><h3 class="pps-h">Class numbers for MyPack</h3><p class="pps-sub">Register in this order: fewest backups first.</p><ol>' +
        lines.map(function (l) {
          return '<li><strong>' + esc(l.code) + '</strong> ' + l.u.sections.map(function (s) { return esc(s.comp + ' ' + s.sec) + ' <span class="pps-nbr">' + s.nbr + '</span>'; }).join(' + ') +
            (l.cv ? '<div class="pps-flag warn">' + esc(l.cv) + '</div>' : '') +
            '<div class="pps-muted">Backups: ' + (l.bk.length ? esc(l.bk.slice(0, 3).map(function (b) { return b.unit.sections.map(function (x) { return x.nbr; }).join('+'); }).join(', ')) : 'none fit') + '</div></li>';
        }).join('') + '</ol><div class="pps-actions"><button type="button" class="pps-btn" data-av="copy">Copy class numbers</button><span class="pps-actmsg" aria-live="polite"></span></div></div>';
    }
    var fl = fullList();
    if (fl.length) h += '<div class="pps-fulllist"><div class="pps-flabel">Marked full</div><ul>' + fl.map(function (f) {
      return '<li><span class="pps-nbr">' + esc(f.key) + '</span> ' + esc(f.c.code) + ' <button type="button" class="pps-link" data-unfull="' + esc(f.key) + '">Undo</button></li>';
    }).join('') + '</ul><p class="pps-muted pps-small">Paw Plan will not suggest these again. Undo if a seat opens.</p></div>';
    h += '<button type="button" class="pps-btn pps-btn-ghost pps-wide" data-av="builder">' + (ADVISOR ? 'Plans A, B, C and advising check' : 'See Plans A, B, C and preferences') + '</button>';
    if (ADVISOR) h += '<button type="button" class="pps-btn pps-btn-ghost pps-wide" data-av="next">Next student</button>';
    h += '<p class="pps-muted pps-small">Sections as of ' + esc(fmtDate(asOf())) + '. Put your picks and backups in your MyPack shopping cart before your enrollment time; it shows live seats.</p>';
    return h;
  }

  // ---------- NC community college transfer guide ----------
  function normCode(x) { var m = String(x || '').toUpperCase().replace(/\s+/g, ' ').trim().match(/^([A-Z]{2,4})\s?(\d{3}[A-Z]?)$/); return m ? m[1] + ' ' + m[2] : String(x || '').toUpperCase().trim(); }
  function ccEntry(code) { var k = normCode(code); return ((state.cc || {}).courses || []).filter(function (e) { return e.cc === k; })[0] || null; }
  function reqOptions(c) {
    // Classify the requirement itself, ignoring any transfer plan already saved on it.
    if (!av.T) av.T = E.toolkit(state.index, B.getPlan(), B.lists, engPrefs(), engInput());
    var sl = av.T.slotOf(Object.assign({}, c, { transferPlan: null }));
    if (sl.kind === 'fixed' || sl.kind === 'choice') return sl.options;
    if (sl.kind === 'open' && sl.pool) return sl.pool.options;
    return [];
  }
  function ccFills(entry, options) {
    if (!entry || !entry.ncsu.length) return false;
    return options.some(function (o) { return o.every(function (x) { return entry.ncsu.indexOf(x) !== -1; }); });
  }
  // Guide courses that fill this requirement. Never for a requirement with an ARE option (ARE over Poole).
  function ccMatches(c) {
    var opts = reqOptions(c);
    if (opts.some(function (o) { return o.some(function (x) { return /^ARE /.test(x); }); })) return [];
    return ((state.cc || {}).courses || []).filter(function (e) { return ccFills(e, opts); });
  }
  // Audit lines where any one course fills the requirement; a second one does not count for it again.
  var SAME_REQ = [['ACC 200', 'ACC 210'], ['MA 121', 'MA 131', 'MA 141'], ['MA 114', 'MA 231', 'MA 241'], ['ST 311', 'ST 350', 'BUS 350'],
    ['COM 112', 'COM 211', 'COM 226', 'ENG 332'], ['AEE 226', 'CSC 200', 'ARE 255'], ['ARE 301', 'EC 301'], ['ARE 303', 'ARE 304'],
    ['ARE 306', 'ARE 309'], ['ARE 311', 'ARE 312'], ['ARE 321', 'ARE 323', 'BUS 320'], ['BIO 105', 'BIO 181', 'PB 200']];
  // Courses the student already has, has picked, or plans at another school, other than on course `skip`.
  function haveCourses(skip) {
    var have = {}, set = function (x, where) { if (!have[x]) have[x] = where; };
    (B.getTransferred() || []).forEach(function (t) { if (t && t.code) set(normCode(t.code), 'already on your record as transfer credit'); });
    B.getPlan().forEach(function (sem) {
      var named = /^(Completed NC State|Prior NC State|Transfer|In Progress)/.test(sem.term);
      sem.courses.forEach(function (x) {
        if (x === skip || (skip && x.id && x.id === skip.id)) return;
        var codes = String(x.code || '').split('+').map(function (y) { return normCode(y); }).filter(function (y) { return /^[A-Z]{1,4} \d{3}[A-Z]?$/.test(y); });
        if (x.transferPlan) {
          var te = x.transferPlan.kind === 'nccc' ? ccEntry(x.transferPlan.course) : null;
          (te ? te.ncsu : []).forEach(function (y) { set(y, 'planned at ' + (x.transferPlan.school || 'another school') + ' (' + x.transferPlan.course + ')'); });
          return;
        }
        if (named || x.importedFromAudit || x.classification === 'planned_current' || x.auditStatus === 'planned_current') codes.forEach(function (y) { set(y, 'already on your record (taken or in progress)'); });
        else if (x.sched) (x.sched.codes || codes).forEach(function (y) { set(y, 'picked for ' + sem.term); });
      });
    });
    return have;
  }
  function ccDuplicate(c, e) {
    var have = haveCourses(c);
    var same = e.ncsu.filter(function (x) { return have[x]; })[0];
    if (same) return e.cc + ' transfers as ' + e.as + ', and ' + same + ' is ' + have[same] + '. NC State does not give credit twice for the same course.';
    for (var i = 0; i < SAME_REQ.length; i++) {
      var g = SAME_REQ[i], mine = e.ncsu.filter(function (x) { return g.indexOf(x) !== -1; })[0];
      var other = mine && g.filter(function (x) { return x !== mine && have[x]; })[0];
      if (other) return e.cc + ' transfers as ' + mine + '. ' + mine + ' and ' + other + ' fill the same requirement, and ' + other + ' is ' + have[other] + ', so ' + mine + ' would not count for that requirement again.';
    }
    return '';
  }
  function ccCheck(c, tp) {
    if (!tp || tp.kind !== 'nccc' || !tp.course) return null;
    var e = ccEntry(tp.course), label = c.schedOrigCode || c.code;
    var dup = e && ccDuplicate(c, e);
    if (dup) return { level: 'stop', text: dup };
    if (!e) return { level: 'warn', text: tp.course + ' is not in the ABM transfer guide. Check the NC State transfer database before enrolling.' };
    if (ccFills(e, reqOptions(c))) return { level: 'ok', text: 'In the ABM transfer guide: ' + e.cc + ' transfers as ' + e.as + '.' };
    return { level: 'stop', text: e.cc + ' transfers as ' + e.as + ', which does not fill ' + label + '.' };
  }

  function elsewhereForm(r) {
    var key = rowKey(r.c), plan = B.getPlan(), tr = E.termRank(state.index.term), terms = [];
    plan.forEach(function (s) { var x = E.termRank(s.term); if (x !== null && x >= tr) terms.push(s.term); });
    terms.sort(function (a, b) { return E.termRank(a) - E.termRank(b); });
    return '<div class="pps-choose pps-elsewhere" role="region" aria-label="Taking this course at another school">' +
      '<p><strong>Plan to take ' + esc(dispCode(r.c.schedOrigCode || r.c.code)) + ' at another school.</strong> Fill in the school, course, and term, then click the button. The requirement moves to that term in your plan and is marked "At another school." You still enroll at that school yourself and send the transcript to NC State.</p>' +
      ccHint(r) +
      '<div class="pps-elsef"><label>Type of school<select data-ew="kind"><option value="nccc">NC community college</option><option value="other">Other college or university</option></select></label>' +
      '<label>School<input type="text" data-ew="school" placeholder="e.g. Wake Tech"></label>' +
      '<label>Course<input type="text" data-ew="course" placeholder="e.g. ENG 111"></label>' +
      '<label>Term<select data-ew="term">' + termChoices(terms).map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('') + '</select></label></div>' +
      '<p class="pps-muted">Courses not in the ABM transfer guide, and courses from other schools, need a check in the <a href="' + esc((state.cc || {}).database || 'https://webappprd.acs.ncsu.edu/php/transfer/') + '" target="_blank" rel="noopener">NC State transfer database</a>. ' + (ADVISOR ? 'Confirm' : 'Confirm with your advisor') + ' that the course transfers to NC State as ' + esc(r.c.schedOrigCode || r.c.code) + ' before enrolling.</p>' +
      '<div class="pps-actions"><button type="button" class="pps-btn pps-btn-sm" data-ewsave="' + key + '">Add to my plan as another school</button><button type="button" class="pps-link" data-ewcancel="1">Cancel</button></div></div>';
  }
  function dbLink(text) {
    return '<a class="pps-dblink" href="' + esc((state.cc || {}).database || 'https://webappprd.acs.ncsu.edu/php/transfer/') + '" target="_blank" rel="noopener">' + esc(text || 'Search the NC State transfer database') + ' &#8599;</a>';
  }
  function ccHint(r) {
    var m = ccMatches(r.c), cc = state.cc;
    if (!cc) return '<div class="pps-cchint none">' + dbLink() + '</div>';
    if (!m.length) return '<div class="pps-cchint none">No NC community college course for this requirement is in the ABM transfer guide. ' + dbLink('Search the NC State transfer database for one') + '</div>';
    return '<div class="pps-cchint"><div class="pps-flabel">From NC State\'s ABM transfer guide (' + esc((cc.source.match(/\d{4}-\d{4}/) || [''])[0].replace('-', '\u2013')) + ')</div><ul>' +
      m.map(function (e) { return '<li><strong>' + esc(e.cc) + '</strong> at any NC community college transfers as ' + esc(e.as) + ' (' + e.hrs + ' cr). <button type="button" class="pps-link" data-ccuse="' + esc(e.cc) + '">Use ' + esc(e.cc) + '</button></li>'; }).join('') +
      '</ul><a class="pps-muted" href="' + esc(cc.url) + '" target="_blank" rel="noopener">See the full guide</a> \u00b7 Taking a different course? ' + dbLink('Check it in the NC State transfer database') + '</div>';
  }
  // Summer has two sessions; both belong to the plan's single summer term.
  function termChoices(terms) {
    var out = [];
    terms.forEach(function (t) { var m = t.match(/^Summer (\d{4})$/); if (m) out.push('Summer 1 ' + m[1], 'Summer 2 ' + m[1]); else out.push(t); });
    return out;
  }
  function planTermOf(label) { var m = String(label || '').match(/^Summer [12] (\d{4})$/); return m ? 'Summer ' + m[1] : label; }
  function planElsewhere(c, info) {
    info.termLabel = info.term; info.term = planTermOf(info.term);
    B.commit(function (plan) {
      var at = findCourse(plan, c), dest = -1;
      if (!at) return;
      plan.forEach(function (s, i) { if (s.term === info.term) dest = i; });
      c.transferPlan = info;
      c.transferFrom = plan[at.si].term;
      if (dest !== -1 && dest !== at.si) { plan[at.si].courses.splice(at.ci, 1); plan[dest].courses.push(c); }
    });
  }
  function undoElsewhere(c) {
    B.commit(function (plan) {
      var at = findCourse(plan, c), back = -1;
      plan.forEach(function (s, i) { if (s.term === c.transferFrom) back = i; });
      if (at && back !== -1 && back !== at.si) { plan[at.si].courses.splice(at.ci, 1); plan[back].courses.push(c); }
      delete c.transferPlan; delete c.transferFrom;
    });
  }

  // ---------- audit view: writing picks back to Paw Plan ----------
  function pickInto(c, entry, time) {
    var T = av.T, term = state.index.term;
    B.commit(function (plan) {
      var ti = -1; plan.forEach(function (s, i) { if (s.term === term) ti = i; });
      var at = findCourse(plan, c);
      if (!at || ti === -1) return;
      if (plan[at.si].term !== term) {
        if (!c.schedFrom) c.schedFrom = plan[at.si].term;
        plan[at.si].courses.splice(at.ci, 1);
        plan[ti].courses.push(c);
      }
      var slot = T.slotOf(c);
      if (slot.kind !== 'fixed') {
        if (!c.schedOrigCode) { c.schedOrigCode = c.code; c.schedOrigName = c.name; c.schedOrigUnits = c.units; }
        c.code = entry.code; c.name = entry.title;
        // Credits follow the course picked (a 2-credit elective remainder filled by a 3-credit course).
        c.units = time.units.reduce(function (t, u) { return t + (parseFloat(u.units) || 0); }, 0) || c.units;
      }
      c.sched = { term: term, codes: entry.option.slice(), nbrs: time.units.map(function (u) { return T.unitKey(u); }) };
      if (state.tab && state.tab.session) c.sched.session = state.tab.session;
    });
  }
  // A class beyond the degree requirements (to try options or reach full time). It is a Free Elective
  // slot in the plan, marked schedExtra, and Remove deletes it.
  function addExtra() {
    var term = state.index.term, c = { id: 'EXTRA' + Date.now().toString(36), code: 'Free Elective', name: 'Click to choose', units: 3, cat: 'free', picker: 'free', schedExtra: true };
    B.commit(function (plan) { plan.forEach(function (s) { if (s.term === term) s.courses.push(c); }); });
    av.expanded = rowKey(c);
    av.chips[av.expanded] = { are: 1, _free: 1 };
    return c;
  }
  function removePick(c) {
    if (c.schedExtra) { B.commit(function (plan) { var at = findCourse(plan, c); if (at) plan[at.si].courses.splice(at.ci, 1); }); return; }
    B.commit(function (plan) {
      if (c.schedOrigCode) { c.code = c.schedOrigCode; c.name = c.schedOrigName || 'Click to choose'; if (c.schedOrigUnits) c.units = c.schedOrigUnits; }
      delete c.schedOrigCode; delete c.schedOrigName; delete c.schedOrigUnits; delete c.sched;
      if (c.schedFrom) {
        var at = findCourse(plan, c), back = -1;
        plan.forEach(function (s, i) { if (s.term === c.schedFrom) back = i; });
        if (at && back !== -1 && at.si !== back) { plan[at.si].courses.splice(at.ci, 1); plan[back].courses.push(c); }
        delete c.schedFrom;
      }
    });
  }
  // "Not this term": move a suggested course to the earliest later regular term that stays at 18 credits or less.
  function deferCourse(c) {
    var term = state.index.term, tr = E.termRank(term);
    B.commit(function (plan) {
      var at = findCourse(plan, c);
      if (!at) return;
      var load = function (i) { return plan[i].courses.reduce(function (t, x) { return t + (Number(x.units) || 0); }, 0); };
      var later = [];
      plan.forEach(function (s, i) { var r = E.termRank(s.term); if (r !== null && r > tr && !B.isSummerTerm(s.term)) later.push(i); });
      later.sort(function (a, b) { return E.termRank(plan[a].term) - E.termRank(plan[b].term); });
      var u = Number(c.units) || 3, dest = null;
      for (var i = 0; i < later.length && dest === null; i++) if (load(later[i]) + u <= 18) dest = later[i];
      if (dest === null && later.length) dest = later[0];
      if (dest === null) return;
      plan[at.si].courses.splice(at.ci, 1);
      plan[dest].courses.push(c);
    });
  }
  // Fill every suggested spring course with the best sections, using the full schedule engine
  // (same search as Plan A). Sections the student already picked stay as they are.
  function autoPick() {
    var plan = B.getPlan(), T = av.T;
    var res = E.buildSchedules(state.index, plan, B.lists, engPrefs(), engInput());
    if (!res.ok || !res.plans.length) return 'Paw Plan could not fit the suggested courses together. Pick them one at a time instead.';
    var A = res.plans[0], bySlot = {};
    A.items.forEach(function (it) { var k = it.slot.si + ':' + it.slot.ci; (bySlot[k] = bySlot[k] || { slot: it.slot, codes: [], units: [] }); bySlot[k].codes.push(it.code); bySlot[k].units.push(it.unit); });
    A.open.forEach(function (o) { if (o.pick) bySlot[o.slot.si + ':' + o.slot.ci] = { slot: o.slot, codes: o.pick.option.slice(), units: o.pick.groupsFit.map(function (g) { return g.rep; }), title: o.pick.title }; });
    var n = 0, skipped = [];
    // Meetings of sections already picked: auto-pick never creates a conflict with them.
    var taken = meetingsOf(av.rows || [], null);
    B.commit(function (pl) {
      Object.keys(bySlot).forEach(function (k) {
        var b = bySlot[k], c = pl[b.slot.si] && pl[b.slot.si].courses[b.slot.ci];
        if (!c || c.sched) return;
        var mine = [].concat.apply([], b.units.map(function (u) { return u.meetings; }));
        var clash = taken.filter(function (o) { return mine.some(function (m) { return E.unitConflicts({ meetings: [m] }, [o]); }); });
        if (clash.length) { skipped.push(b.codes.join(' + ') + ' (conflicts with ' + clash.map(function (o) { return o.code; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(', ') + ')'); return; }
        taken = taken.concat(mine);
        var slot = T.slotOf(c);
        if (slot.kind !== 'fixed') {
          if (!c.schedOrigCode) { c.schedOrigCode = c.code; c.schedOrigName = c.name; c.schedOrigUnits = c.units; }
          c.units = b.units.reduce(function (t, u) { return t + (parseFloat(u.units) || 0); }, 0) || c.units;
          c.code = b.codes.join(' + ');
          c.name = b.title || courseTitle(b.codes[0]);
        }
        c.sched = { term: state.index.term, codes: b.codes.slice(), nbrs: b.units.map(function (u) { return T.unitKey(u); }) };
        n++;
      });
    });
    var left = (av.rows || []).filter(function (r) { return r.status === 'need' && r.suggested; }).map(function (r) { return dispCode(r.c.schedOrigCode || r.c.code); });
    var picked = n ? 'Picked times for ' + n + ' course' + (n === 1 ? '' : 's') + '. ' : '';
    if (skipped.length) return picked + 'Not filled: ' + skipped.join('; ') + '. Change the conflicting pick, then try again.';
    var notAuto = left.filter(function (x) { return !Object.keys(bySlot).some(function (k) { return dispCode(bySlot[k].slot.label) === x; }); });
    if (!n) return 'Nothing to fill automatically. ' + (notAuto.length ? 'Choose these yourself with "Choose for ' + termLabel() + '": ' + notAuto.join(', ') + '.' : 'Every suggested course already has a time.');
    return picked + (notAuto.length ? 'Choose these yourself: ' + notAuto.join(', ') + '.' : '');
  }

  function wireAudit(o, rows, T) {
    function rowBy(key) { for (var i = 0; i < rows.length; i++) if (rows[i].c._avk === key) return rows[i]; return null; }
    o.querySelectorAll('[data-choose]').forEach(function (b) {
      b.addEventListener('click', function () { var k = b.getAttribute('data-choose'); av.expanded = av.expanded === k ? null : k; av.elsewhere = null; renderAudit(); });
    });
    o.querySelectorAll('[data-pick]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-pick').split(':'), entry = av.lists[p[0]] && av.lists[p[0]][+p[1]];
        var r = entry && entry.rowKey ? rowBy(entry.rowKey) : rowBy(p[0]);
        if (entry && entry.makeExtra) {
          var xid = addExtra().id, xc = null;
          B.getPlan().forEach(function (sem) { sem.courses.forEach(function (c) { if (c.id === xid) xc = c; }); });
          if (xc) pickInto(xc, entry, entry.times[+p[2]]);
          av.expanded = null; renderAudit(); return;
        }
        if (!r || !entry) return;
        pickInto(r.c, entry, entry.times[+p[2]]);
        av.expanded = null; av.queries[p[0]] = '';
        renderAudit();
      });
    });
    o.querySelectorAll('[data-fchip]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-fchip').split(':'), c = av.chips[p[0]] || (av.chips[p[0]] = {});
        c[p[1]] = !c[p[1]];
        if (p[1] === 'mwf' && c.mwf) c.tth = false;
        if (p[1] === 'tth' && c.tth) c.mwf = false;
        if (p[1] === 'online' && c.online) { c.mwf = false; c.tth = false; }
        if ((p[1] === 'mwf' || p[1] === 'tth') && c[p[1]]) c.online = false;
        av.all[p[0]] = false;
        renderAudit();
      });
    });
    o.querySelectorAll('[data-full]').forEach(function (b) { b.addEventListener('click', function () { var p = b.getAttribute('data-full').split(':'), r = rowBy(p[0]); if (r && r.c.sched && r.units[+p[1]]) { markFull(r, +p[1]); renderAudit(); } }); });
    o.querySelectorAll('[data-unfull]').forEach(function (b) { b.addEventListener('click', function () { unmarkFull(b.getAttribute('data-unfull')); av.msg = ''; renderAudit(); }); });
    o.querySelectorAll('[data-remove]').forEach(function (b) { b.addEventListener('click', function () { var r = rowBy(b.getAttribute('data-remove')); if (r) { removePick(r.c); renderAudit(); } }); });
    o.querySelectorAll('[data-elsewhere]').forEach(function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-elsewhere'); av.elsewhere = av.elsewhere === k ? null : k; av.expanded = null; renderAudit(); }); });
    o.querySelectorAll('[data-ewcancel]').forEach(function (b) { b.addEventListener('click', function () { av.elsewhere = null; renderAudit(); }); });
    o.querySelectorAll('[data-ewsave]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = rowBy(b.getAttribute('data-ewsave')), box = b.closest('.pps-elsewhere');
        if (!r) return;
        var v = function (k) { return (box.querySelector('[data-ew="' + k + '"]').value || '').trim(); };
        var kind = v('kind'), course = kind === 'nccc' ? normCode(v('course')) : v('course').toUpperCase();
        var dup = kind === 'nccc' && ccEntry(course) && ccDuplicate(r.c, ccEntry(course));
        if (dup) {
          var w = box.querySelector('.pps-ewdup') || box.insertBefore(document.createElement('div'), box.querySelector('.pps-actions'));
          w.className = 'pps-flag warn pps-ewdup'; w.setAttribute('role', 'alert'); w.textContent = dup + ' Pick a different course.';
          return;
        }
        planElsewhere(r.c, { kind: kind, school: v('school') || (kind === 'nccc' ? 'NC community college' : ''), course: course, term: v('term') });
        av.elsewhere = null; renderAudit();
      });
    });
    o.querySelectorAll('[data-ccuse]').forEach(function (b) {
      b.addEventListener('click', function () {
        var box = b.closest('.pps-elsewhere');
        box.querySelector('[data-ew="kind"]').value = 'nccc';
        box.querySelector('[data-ew="course"]').value = b.getAttribute('data-ccuse');
        var sc = box.querySelector('[data-ew="school"]'); if (!sc.value) sc.focus();
      });
    });
    o.querySelectorAll('[data-untransfer]').forEach(function (b) { b.addEventListener('click', function () { var r = rowBy(b.getAttribute('data-untransfer')); if (r) { undoElsewhere(r.c); renderAudit(); } }); });
    o.querySelectorAll('[data-skip]').forEach(function (b) { b.addEventListener('click', function () { var r = rowBy(b.getAttribute('data-skip')); if (r) { deferCourse(r.c); renderAudit(); } }); });
    o.querySelectorAll('[data-allfor]').forEach(function (b) { b.addEventListener('click', function () { av.all[b.getAttribute('data-allfor')] = true; renderAudit(); }); });
    o.querySelectorAll('[data-alltimes]').forEach(function (b) { b.addEventListener('click', function () { av.all[b.getAttribute('data-alltimes')] = true; renderAudit(); }); });
    o.querySelectorAll('[data-q]').forEach(function (inp) {
      var t = null;
      inp.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          var k = inp.getAttribute('data-q'), was = av.queries[k] || '', ck = av.chips[k];
          // Starting a search on a free elective covers every subject (ARE filter can be turned back on).
          if (ck && ck._free && ck.are && was.trim().length < 2 && inp.value.trim().length >= 2) ck.are = false;
          av.queries[k] = inp.value; renderAudit();
          var again = o.querySelector('[data-q="' + k + '"]');
          if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        }, 250);
      });
    });
    o.querySelectorAll('[data-av]').forEach(function (b) {
      var act = b.getAttribute('data-av');
      if (act === 'plan') return;
      b.addEventListener('click', function () {
        if (act === 'builder') { openBuilder(); return; }
        if (act === 'next') { close(); if (B.openAuditUpload) B.openAuditUpload(); return; }
        if (act === 'auto') { av.msg = autoPick(); renderAudit(); var sp = o.querySelector('.pps-avside'); if (sp) sp.scrollTop = 0; return; }
        if (act === 'addx') { addExtra(); renderAudit(); var x = o.querySelector('.pps-avrow.on'); if (x && x.scrollIntoView) x.scrollIntoView({ block: 'center' }); return; }
        if (act === 'copy') {
          var txt = termLabel() + ' class numbers (Paw Plan)' + (studentName() ? ' for ' + studentName() : '') + '\n' + (av.lines || []).map(function (l, i) {
            return (i + 1) + '. ' + l.code + '  ' + l.u.sections.map(function (s) { return s.comp + ' ' + s.sec + ': ' + s.nbr; }).join(' + ') + (l.bk.length ? '   backups: ' + l.bk.slice(0, 3).map(function (x) { return x.unit.sections.map(function (y) { return y.nbr; }).join('+'); }).join(', ') : '');
          }).join('\n');
          var done = function () { var m = o.querySelector('.pps-avpack .pps-actmsg'); if (m) m.textContent = 'Copied.'; };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
          else { fallbackCopy(txt); done(); }
        }
      });
    });
  }

  // ---------- advisor view ----------
  function totalSections(code) { var t = 0; ((state.result.sectionsOf(code) || {}).groups || []).forEach(function (g) { t += g.units.length; }); return t; }
  function nbrs(u) { return u.sections.map(function (s) { return s.nbr; }).join('+'); }

  // Everything an advisor should catch before the student registers, most serious first.
  function advisorChecks(r, plan) {
    var out = [], ctx = r.ctx;
    function add(level, text) { out.push({ level: level, text: text }); }
    var choose = 0, unpicked = [];
    plan.open.forEach(function (o) { choose += Number(o.slot.units) || 0; if (!o.pick) unpicked.push(o.slot.isFree ? 'Free elective' : (o.slot.tag || o.slot.label)); });
    var noteCr = 0;
    r.notes.forEach(function (n) { if (n.slot && n.slot.kind === 'note') noteCr += Number(n.slot.units) || 0; });
    var total = plan.credits + choose + noteCr;
    var load = total + ' credits in Paw Plan for ' + r.term + ': ' + plan.credits + ' scheduled' + (choose ? ', ' + choose + ' to choose' : '') + (noteCr ? ', ' + noteCr + ' to settle with the advisor' : '') + '.';
    if (total < 12) add('stop', load + ' That is below full-time (12).');
    else if (total > 18) add('stop', load + ' That is above 18 and needs an overload approval.');
    else add('info', load);
    r.notes.forEach(function (n) { if (n.severe) add('stop', n.text); });
    r.notes.forEach(function (n) { if (!n.severe && !n.transfer) add('warn', n.text); });
    if (plan.relaxed) add('warn', 'No schedule meets every preference set below. Sections that break one are marked on their cards.');
    var only = [], few = [];
    plan.items.forEach(function (it) {
      var t = totalSections(it.code);
      if (t <= 1) only.push(it.code + ' (' + nbrs(it.unit) + ')');
      else if ((it.backups || []).length <= 2) few.push(it.code + ' (' + (it.backups || []).length + ' backup' + ((it.backups || []).length === 1 ? '' : 's') + ')');
    });
    if (only.length) add('warn', 'Only one section offered: ' + only.join(', ') + '. Register for these first.');
    if (few.length) add('warn', 'Few backups that fit this plan: ' + few.join(', ') + '.');
    plan.items.forEach(function (it) {
      if (it.prereq) add('warn', it.code + ': ' + it.prereq + '. Confirm the student has it or is taking it now.');
      if (it.unit.tentative) add('warn', it.code + ' section ' + it.unit.sections[0].sec + ' is tentative and could still be cancelled.');
      if (it.group.restricted) add('warn', it.code + ' section ' + it.unit.sections[0].sec + ': ' + it.group.note + ' Confirm the student can enroll.');
      else if (it.group.note) add('info', it.code + ': ' + it.group.note + '.');
    });
    // Options Paw Plan could not use, one line per requirement. Sections closed to ABM students
    // (other majors only) are left out: they were never real options.
    r.slots.forEach(function (sl) {
      if ((sl.kind !== 'fixed' && sl.kind !== 'choice') || !sl.usable || !sl.usable.length) return;
      var why = (sl.dropped || []).map(function (d) { return d.why; }).filter(function (w) { return !/Restricted:/.test(w); });
      if (why.length) add('info', sl.label + ': ' + why.join('; ') + '.');
    });
    ['GK', 'AD'].forEach(function (k) {
      if (!ctx['need' + k]) return;
      var name = k === 'GK' ? 'Global Knowledge' : 'American Democracy';
      var covered = plan.open.some(function (o) { return (o.pick && o.pick.alsoCounts.indexOf(name) !== -1) || o.candidates.some(function (c) { return c.alsoCounts.indexOf(name) !== -1; }); });
      add('warn', 'Still needs GEP ' + name + '. ' + (covered ? 'A spring choice below can cover it; look for "Also counts: ' + name + '".' : 'Nothing in this spring plan covers it, so plan it for a later term.'));
    });
    if (unpicked.length) add('info', 'Still to choose: ' + unpicked.join(', ') + '.');
    // Courses planned at another school in later terms (spring ones already appear as notes).
    B.getPlan().forEach(function (sem) {
      sem.courses.forEach(function (c) {
        if (!c.transferPlan) return;
        var tp = c.transferPlan;
        var chk = ccCheck(c, tp);
        add(chk && chk.level === 'stop' ? 'stop' : 'warn', (c.code) + ': planned at ' + (tp.school || 'another school') + (tp.course ? ' (' + tp.course + ')' : '') + (tp.term ? ', ' + (tp.termLabel || tp.term) : '') + '. ' + (chk ? chk.text + ' ' : '') + 'Confirm it transfers before the student enrolls.');
      });
    });
    add('info', STANDING_TEXT[ctx.student.standing] + ' standing by credits (' + ctx.priorCredits + ' earned or in progress)' + (ctx.student.gpa != null ? ', cumulative GPA ' + ctx.student.gpa.toFixed(3) : '') + '.');
    return out;
  }
  function advisorPanel(r, plan) {
    var checks = advisorChecks(r, plan);
    var order = { stop: 0, warn: 1, info: 2 };
    checks.sort(function (a, b) { return order[a.level] - order[b.level]; });
    return '<section class="pps-advise" aria-label="Advising check"><h3>Advising check' + (r.plans.length > 1 ? ' <span>for ' + esc(plan.label) + '</span>' : '') + '</h3><ul>' +
      checks.map(function (c) { return '<li class="lv-' + c.level + '"><span class="pps-lv">' + { stop: 'Fix', warn: 'Check', info: 'Note' }[c.level] + '</span><span>' + esc(c.text) + '</span></li>'; }).join('') + '</ul></section>';
  }
  function meetLine(u) { return meetText(u).replace(/\u2013/g, '-'); }
  // Plain-text note for advising records or an email to the student.
  function advisingNote(r, plan) {
    var name = studentName(), t = [];
    var d0 = new Date(), today = d0.getFullYear() + '-' + ('0' + (d0.getMonth() + 1)).slice(-2) + '-' + ('0' + d0.getDate()).slice(-2);
    t.push(r.term + ' registration plan' + (name ? ' for ' + name : '') + ' (Paw Plan, ' + fmtDate(today) + ')');
    t.push('');
    t.push(plan.label + ': register in this order. Class numbers are for the MyPack shopping cart.');
    mypackLines(plan).forEach(function (l, n) {
      var it = plan.items.filter(function (x) { return x.code === l.code; })[0];
      var when = it ? meetLine(it.unit) : '';
      t.push((n + 1) + '. ' + l.code + '  ' + l.secs.map(function (s) { return s.comp + ' ' + s.sec + ' #' + s.nbr; }).join(' + ') + (when ? '  (' + when + ')' : '') + (l.backups.length ? '  Backups: ' + l.backups.join(', ') : '  No backup section fits'));
    });
    var open = plan.open.filter(function (o) { return !o.pick; });
    if (open.length) {
      t.push('');
      t.push('Still to choose:');
      open.forEach(function (o) {
        var lbl = (o.slot.isFree ? 'Free elective' : (o.slot.tag || o.slot.label)) + ' (' + o.slot.units + ' cr)';
        var top = o.candidates.slice(0, 5).map(function (c) { return c.code + (c.alsoCounts.length ? ' [also ' + c.alsoCounts.join(', ') + ']' : ''); });
        t.push('- ' + lbl + (top.length ? ': options that fit include ' + top.join(', ') : ': any course that fits your open times') + '.');
      });
    }
    var pullLines = [];
    plan.items.forEach(function (it) {
      var pa = r.pullAhead(plan, it).slice(0, 2);
      if (pa.length) pullLines.push('- If ' + it.code + ' fills: take ' + pa.map(function (c) { return c.code + ' now (planned for ' + c.fromTerm + ', #' + nbrs(c.group.rep) + ')'; }).join(' or ') + ', and move ' + it.code + ' later.');
    });
    if (pullLines.length) { t.push(''); t.push('If a course fills completely, these later courses fit instead:'); pullLines.forEach(function (l) { t.push(l); }); }
    var alt = r.plans.filter(function (p) { return p !== plan; })[0];
    if (alt) {
      t.push('');
      t.push('If sections fill, use ' + alt.label + ' (' + planSubtitle(alt) + '):');
      mypackLines(alt).forEach(function (l) { t.push('- ' + l.code + '  ' + l.secs.map(function (s) { return s.comp + ' ' + s.sec + ' #' + s.nbr; }).join(' + ')); });
    }
    var checks = advisorChecks(r, plan).filter(function (c) { return c.level !== 'info'; });
    if (checks.length) {
      t.push('');
      t.push('Before you register:');
      checks.forEach(function (c) { t.push('- ' + c.text); });
    }
    t.push('');
    t.push('Sections as of ' + fmtDate(asOf()) + '; some may have filled. Put these and the backups in the MyPack shopping cart before the enrollment time. It shows live seats.');
    return t.join('\n');
  }

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Date the class data was pulled from the Schedule of Classes.
  function asOf() { return (state.term && (state.term.asOf || state.term.built)) || ''; }
  function shortDate(iso) { var m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})/); return m ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[1] - 1] + ' ' + (+m[2]) : iso; }
  function staleNote() {
    return 'Sections as of ' + fmtDate(asOf()) + '. Some may have filled since. Before ' + (ADVISOR ? 'the student\'s' : 'your') + ' enrollment time, put the picks and backups in the MyPack shopping cart, which shows live seats. If a section is full, click "Full in MyPack?" and Paw Plan swaps in a backup.';
  }
  function fmtDate(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return iso || '';
    return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1];
  }

  function injectStyle() {
    if (document.getElementById('pps-style')) return;
    var st = document.createElement('style');
    st.id = 'pps-style';
    st.textContent = [
      '#pps-open-btn{background:#fff;color:#000;border:2px solid #000!important;font-weight:600}',
      '#pps-open-btn:hover{background:#000;color:#fff}',
      '.pps-beta{display:inline-block;font:700 .62rem/1 Inter,Roboto,sans-serif;letter-spacing:.06em;text-transform:uppercase;background:#CC0000;color:#fff;padding:.18rem .35rem;margin-left:.35rem;vertical-align:middle}',
      'body.pps-open{overflow:hidden}',
      '.pps{position:fixed;inset:0;z-index:300;background:#F2F2F2;display:flex;flex-direction:column;font-family:Inter,Roboto,system-ui,sans-serif;color:#1F1F1F}',
      '.pps *{box-sizing:border-box}',
      '.pps-top{background:#000;color:#fff;border-bottom:6px solid #CC0000}',
      '.pps-top-in{max-width:1280px;margin:0 auto;padding:.7rem 1.25rem;display:flex;justify-content:space-between;align-items:center;gap:1rem}',
      '.pps-kicker{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:#bbb}',
      '.pps-top h2{margin:.1rem 0 0;font:700 1.35rem/1.2 "Roboto Slab",Georgia,serif}',
      '.pps-x{background:none;border:2px solid #fff;color:#fff;font-size:1.5rem;line-height:1;width:2.4rem;height:2.4rem;cursor:pointer}',
      '.pps-x:hover,.pps-x:focus-visible{background:#CC0000;border-color:#CC0000;outline:none}',
      '.pps-body{flex:1;overflow:hidden;display:grid;grid-template-columns:300px 1fr;max-width:1280px;width:100%;margin:0 auto}',
      '.pps-prefs{overflow-y:auto;padding:1rem 1rem 2rem 1.25rem;border-right:1px solid #C7C7C7}',
      '.pps-main{overflow-y:auto;padding:1rem 1.25rem 3rem}',
      '.pps-prefbox{background:#fff;border:2px solid #000;padding:.25rem .9rem .9rem}',
      '.pps-prefbox summary{font:700 1rem "Roboto Slab",Georgia,serif;padding:.6rem 0;cursor:pointer}',
      '.pps-field{display:flex;flex-direction:column;gap:.25rem;margin:.75rem 0;font-size:.82rem;font-weight:600}',
      '.pps-field select,.pps-busy select{font:inherit;font-weight:400;padding:.4rem;border:1px solid #777;background:#fff;color:#1F1F1F;border-radius:0}',
      '.pps-check{display:flex;gap:.5rem;align-items:flex-start;margin:.75rem 0;font-size:.82rem}',
      '.pps-check input{margin-top:.15rem;accent-color:#CC0000}',
      '.pps-flabel{font-size:.82rem;font-weight:600;margin:.9rem 0 .35rem}',
      '.pps-busy ul{list-style:none;margin:0 0 .4rem;padding:0}',
      '.pps-busy li{display:flex;justify-content:space-between;gap:.5rem;font-size:.8rem;padding:.3rem .45rem;background:#F2F2F2;margin-bottom:.25rem}',
      '.pps-busy-add{border:1px dashed #777;padding:.5rem}',
      '.pps-days{display:flex;gap:.25rem;margin-bottom:.4rem}',
      '.pps-day{position:relative}.pps-day input{position:absolute;opacity:0}',
      '.pps-day span{display:inline-block;min-width:2rem;text-align:center;padding:.3rem .2rem;border:1px solid #777;font-size:.75rem;cursor:pointer;background:#fff}',
      '.pps-day input:checked+span{background:#000;color:#fff;border-color:#000}',
      '.pps-day input:focus-visible+span{outline:2px solid #CC0000;outline-offset:1px}',
      '.pps-busy-times{display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;font-size:.78rem}',
      '.pps-busy-times select{padding:.3rem;font-size:.78rem}',
      '.pps-err{color:#B00000;font-size:.75rem;margin-top:.3rem}',
      '.pps-btn{font:600 .8rem Inter,Roboto,sans-serif;background:#CC0000;color:#fff;border:2px solid #CC0000;padding:.45rem .9rem;cursor:pointer;border-radius:0}',
      '.pps-btn:hover{background:#990000;border-color:#990000}',
      '.pps-btn:focus-visible,.pps-link:focus-visible,.pps-tab:focus-visible{outline:3px solid #1D4ED8;outline-offset:2px}',
      '.pps-btn-sm{font-size:.72rem;padding:.25rem .6rem;white-space:nowrap}',
      '.pps-btn-ghost{background:#fff;color:#000;border-color:#000}.pps-btn-ghost:hover{background:#000;color:#fff;border-color:#000}',
      '.pps-link{background:none;border:none;color:#1D4ED8;text-decoration:underline;cursor:pointer;font:inherit;font-size:.78rem;padding:0}',
      '.pps-source{font-size:.78rem;color:#555;margin:0 0 .75rem}',
      '.pps-alert,.pps-warn,.pps-note{border-left:6px solid #CC0000;background:#fff;padding:.6rem .9rem;margin:0 0 .75rem;font-size:.85rem}',
      '.pps-alert p,.pps-warn p,.pps-note p{margin:.25rem 0}',
      '.pps-warn{border-left-color:#B45309}.pps-note{border-left-color:#777}',
      '.pps-tabs{display:flex;gap:0;border-bottom:3px solid #000;margin-bottom:1rem;overflow-x:auto}',
      '.pps-tab{flex:0 0 auto;background:#fff;border:2px solid #000;border-bottom:none;margin-right:-2px;padding:.5rem 1rem;text-align:left;cursor:pointer;display:flex;flex-direction:column;min-width:9rem}',
      '.pps-tab.on{background:#000;color:#fff}',
      '.pps-tab-l{font:700 1rem "Roboto Slab",Georgia,serif}.pps-tab-s{font-size:.72rem;opacity:.8;max-width:16rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.pps-summary{display:flex;flex-wrap:wrap;gap:.4rem 1.5rem;font-size:.88rem;margin-bottom:.75rem}',
      '.pps-cal-wrap{overflow-x:auto;background:#fff;border:2px solid #000;margin-bottom:.5rem}',
      '.pps-cal{display:grid;grid-template-columns:3.2rem repeat(var(--cols),minmax(92px,1fr));min-width:calc(3.2rem + var(--cols)*92px)}',
      '.pps-cal-head{font:700 .75rem Inter,sans-serif;text-transform:uppercase;letter-spacing:.06em;padding:.4rem;border-bottom:2px solid #000;text-align:center}',
      '.pps-cal-times{position:relative;border-right:1px solid #C7C7C7}',
      '.pps-cal-t{position:absolute;right:.3rem;font-size:.66rem;color:#666;transform:translateY(-.1rem)}',
      '.pps-cal-col{position:relative;border-right:1px solid #E5E5E5}',
      '.pps-cal-line{position:absolute;left:0;right:0;border-top:1px solid #EEE}',
      '.pps-ev{position:absolute;overflow:hidden;padding:.15rem .3rem;font-size:.68rem;line-height:1.2;background:color-mix(in srgb,var(--c) 14%,#fff);border-left:4px solid var(--c);color:#111}',
      '.pps-ev strong{display:block;font-size:.72rem}.pps-ev span{display:block;color:#333}',
      '.pps-ev-pick{border:1px dashed var(--c);border-left:4px dashed var(--c)}',
      '.pps-ev-busy{background:repeating-linear-gradient(45deg,#eee 0 6px,#fafafa 6px 12px);border-left-color:#777;color:#444}',
      '.pps-fchips{display:flex;flex-wrap:wrap;gap:.35rem;margin:.1rem 0 .6rem}.pps-fchip{font:500 .74rem Inter,sans-serif;background:#fff;border:1px solid #999;border-radius:999px;padding:.25rem .7rem;cursor:pointer}.pps-fchip.on{background:#000;color:#fff;border-color:#000}',
      '.pps-cal-alld{font:600 .6rem Inter,sans-serif;text-transform:uppercase;letter-spacing:.04em;color:#555;padding:.35rem .25rem;border-bottom:2px solid #000;border-right:1px solid #C7C7C7;display:flex;align-items:center;justify-content:flex-end;text-align:right;line-height:1.1}',
      '.pps-cal-float{grid-column:2 / -1;display:flex;flex-wrap:wrap;gap:.3rem;padding:.3rem;border-bottom:2px solid #000;background:#FAFAFA}',
      '.pps-ev-float{font-size:.72rem;background:color-mix(in srgb,var(--c) 14%,#fff);border-left:4px solid var(--c);padding:.2rem .45rem}.pps-avside .pps-ev-float{font-size:.62rem}',
      '.pps-float{display:flex;flex-wrap:wrap;gap:.4rem;margin:.25rem 0 1rem;font-size:.78rem}',
      '.pps-float span{background:#fff;border:1px solid #C7C7C7;border-left:4px solid var(--c);padding:.25rem .5rem}',
      '.pps-h{font:700 1.1rem "Roboto Slab",Georgia,serif;margin:1.4rem 0 .5rem}',
      '.pps-sub{font-size:.8rem;color:#555;margin:-.2rem 0 .6rem}',
      '.pps-card{background:#fff;border:1px solid #C7C7C7;border-left:6px solid var(--c);padding:.7rem .9rem;margin-bottom:.6rem}',
      '.pps-card header{display:flex;justify-content:space-between;gap:.5rem 1rem;flex-wrap:wrap;align-items:baseline}',
      '.pps-card h4{margin:0;font-size:1rem}.pps-card h4 span{font-weight:400;color:#444;font-size:.88rem}',
      '.pps-req{font-size:.74rem;color:#555}',
      '.pps-when{font-size:.84rem;font-weight:600}',
      '.pps-sec{display:flex;flex-wrap:wrap;gap:.15rem .9rem;font-size:.78rem;color:#333;margin-top:.35rem}',
      '.pps-comp{font-weight:600}',
      '.pps-nbr{font:700 .8rem "JetBrains Mono",ui-monospace,monospace;background:#000;color:#fff;padding:0 .35rem}',
      '.pps-flags{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.45rem}',
      '.pps-flag{font-size:.72rem;background:#FEF3C7;color:#78350F;padding:.15rem .45rem}',
      '.pps-flag.warn{background:#FEE2E2;color:#7F1D1D}.pps-flag.muted{background:#F2F2F2;color:#444}',
      '.pps-alts{font-size:.76rem;color:#444;margin-top:.4rem}',
      '.pps-nobk{font-size:.76rem;color:#7F1D1D;margin-top:.45rem}',
      '.pps-backups{margin-top:.5rem;border-top:1px solid #E5E5E5;padding-top:.35rem}',
      '.pps-backups summary{cursor:pointer;font-size:.8rem;font-weight:600}',
      '.pps-backups ol,.pps-cands{list-style:none;margin:.35rem 0;padding:0}',
      '.pps-backups li{border:1px solid #E5E5E5;padding:.3rem .55rem;margin-bottom:.3rem;display:flex;gap:.75rem;align-items:center;justify-content:space-between}',
      '.pps-backups li .pps-sec{margin-top:.1rem}.pps-bk-main{min-width:0}',
      '.pps-bk-top{display:flex;flex-wrap:wrap;gap:.4rem .7rem;align-items:center;font-size:.8rem}',
      '.pps-bk-top .pps-btn{margin-left:auto}',
      '.pps-badge{display:inline-block;font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;background:#E5E5E5;color:#222;padding:.12rem .4rem;vertical-align:middle}',
      '.pps-chip.restr{border-style:dashed;border-color:#B45309;max-width:340px;text-align:left}.pps-chip em{display:block;font-style:normal;font-size:11.5px;color:#92400E;white-space:normal;margin-top:2px}',
      '.pps-termtabs{display:flex;gap:.35rem;margin-top:.45rem}.pps-termtab{font:600 .75rem Inter,sans-serif;background:transparent;color:#fff;border:1px solid #fff;padding:.25rem .7rem;cursor:pointer}.pps-termtab.on{background:#fff;color:#000}',
      '.pps-subnote{font-size:.8rem;color:#14532D;margin-top:.15rem}',
      '.pps-finish{font-size:.85rem;background:#ECFDF5;border-left:3px solid #047857;padding:.45rem .6rem;margin:0 0 .75rem}',
      '.pps-stale{font-size:.8rem;background:#FEF3C7;border-left:3px solid #B45309;padding:.45rem .6rem;margin:0 0 .75rem}.pps-fullbtn{display:block;margin:.2rem 0 .1rem;font-size:.78rem}.pps-fulllist{margin:.8rem 0;font-size:.8rem}.pps-fulllist ul{margin:.2rem 0 0 1rem;padding:0}',
      '.pps-hidden{margin:4px 0 0;font-size:12.5px}.pps-hidden summary{cursor:pointer;color:#555}.pps-hidden ul{margin:4px 0 0 18px;padding:0}.pps-hidden li{margin:2px 0}',
      '.pps-badge.good{background:#DCFCE7;color:#14532D}.pps-badge.warn{background:#FEE2E2;color:#7F1D1D}',
      '.pps-muted{color:#666;font-size:.76rem;font-weight:400}',
      '.pps-same{margin-top:.2rem}',
      '.pps-pick{display:grid;grid-template-columns:auto 1fr auto;gap:.2rem .8rem;align-items:baseline;background:#F7F7F7;padding:.45rem .6rem;margin-top:.5rem}',
      '.pps-pick-l{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#CC0000}',
      '.pps-pick .pps-when{grid-column:2}',
      '.pps-search{margin:.6rem 0 .3rem}.pps-search input{width:100%;font:inherit;font-size:.85rem;padding:.45rem .6rem;border:1px solid #777;border-radius:0}',
      '.pps-cands li{display:flex;justify-content:space-between;gap:.75rem;align-items:center;padding:.4rem .2rem;border-bottom:1px solid #EEE;font-size:.84rem}',
      '.pps-cands li.on{background:#F2F2F2}',
      '.pps-mypack{background:#fff;border:2px solid #000;padding:.2rem 1rem 1rem;margin-top:1.4rem}',
      '.pps-mypack table{width:100%;border-collapse:collapse;font-size:.82rem}',
      '.pps-mypack th{text-align:left;border-bottom:2px solid #000;padding:.35rem .4rem;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em}',
      '.pps-mypack td{border-bottom:1px solid #E5E5E5;padding:.35rem .4rem;vertical-align:top}',
      '.pps-nbr-cell{font:700 .9rem "JetBrains Mono",ui-monospace,monospace}',
      '.pps-actions{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-top:.8rem}',
      '.pps-actmsg{font-size:.8rem;color:#14532D}',
      '.pps-msg{background:#fff;border:2px solid #000;padding:1.25rem 1.5rem;max-width:40rem}',
      '.pps-topbtns{display:flex;gap:.5rem;align-items:center}',
      '.pps-back{background:none;border:2px solid #fff;color:#fff;font:600 .78rem Inter,sans-serif;padding:.45rem .7rem;cursor:pointer}',
      '.pps-back:hover,.pps-back:focus-visible{background:#fff;color:#000;outline:none}',
      '.pps-avbody{grid-template-columns:1fr 380px}',
      '.pps-avside{overflow-y:auto;padding:1rem 1.25rem 2rem 1rem;border-left:1px solid #C7C7C7;background:#F7F7F7}',
      '.pps-avside .pps-cal{grid-template-columns:2.4rem repeat(var(--cols),minmax(52px,1fr));min-width:0}.pps-avside .pps-cal-head{font-size:.62rem;padding:.35rem .1rem}.pps-avside .pps-ev{font-size:.58rem}.pps-avside .pps-ev strong{font-size:.62rem}',
      '.pps-avhead{margin-bottom:.75rem}',
      '.pps-counts{display:flex;flex-wrap:wrap;gap:.35rem .9rem;font-size:.84rem;font-weight:600}',
      '.pps-elleft{margin:.6rem 0}.pps-elleft table{width:100%;border-collapse:collapse;font-size:.8rem}.pps-elleft th{text-align:left;font-weight:600;color:#555;border-bottom:1px solid #ddd;padding:.2rem .3rem}.pps-elleft td{padding:.2rem .3rem;border-bottom:1px solid #eee}.pps-elleft td+td,.pps-elleft th+th{text-align:right}' +
    '.st-done{color:#15803D}.st-inprog{color:#1D4ED8}.st-planned{color:#B45309}.st-need{color:#CC0000}.st-transfer{color:#6D28D9}',
      '.st-row-transfer{background:#F5F3FF}',
      '.pps-flag.good{background:#DCFCE7;color:#14532D}',
      '.pps-dblink{color:#1D4ED8;font-weight:600;text-decoration:underline}',
      '.pps-cchint{background:#fff;border:1px solid #C7C7C7;border-left:4px solid #6D28D9;padding:.45rem .7rem;margin:.4rem 0;font-size:.82rem}.pps-cchint ul{margin:.2rem 0 .3rem;padding-left:1.1rem}.pps-cchint.none{border-left-color:#999;color:#555}',
      '.pps-elsef{display:flex;flex-wrap:wrap;gap:.6rem;margin:.4rem 0}.pps-elsef label{display:flex;flex-direction:column;font-size:.76rem;font-weight:600;gap:.2rem}',
      '.pps-elsef input,.pps-elsef select{font:inherit;font-weight:400;font-size:.85rem;padding:.35rem .45rem;border:1px solid #777;border-radius:0;min-width:9rem}',
      '.pps-avsec{background:#fff;border:1px solid #C7C7C7;margin-bottom:.75rem}',
      '.pps-avsec h3{margin:0;padding:.55rem .8rem;font:700 .98rem "Roboto Slab",Georgia,serif;border-bottom:2px solid #000;display:flex;gap:.5rem;align-items:center}',
      '.pps-avrow{display:grid;grid-template-columns:1.6rem 1fr auto;gap:.6rem;align-items:start;padding:.5rem .8rem;border-top:1px solid #EEE}',
      '.pps-avrow:first-child{border-top:none}.pps-avrow.on{background:#FFF8E6}',
      '.st-row-need{background:#FFF7F7}.st-row-planned{background:#FFFBEB}',
      '.pps-ic{font-weight:700;font-size:1rem;line-height:1.3;text-align:center}',
      '.pps-avcls{font-size:.86rem;min-width:0}.pps-avcls>span{color:#444}',
      '.pps-avact{display:flex;flex-direction:column;align-items:flex-end;gap:.3rem;text-align:right}',
      '.pps-avterm{font-size:.74rem;color:#555}',
      '.pps-choose{border-top:1px dashed #C7C7C7;background:#FFFDF6;padding:.6rem .8rem .8rem 3rem}',
      '.pps-entries{list-style:none;margin:.3rem 0;padding:0}.pps-entries>li{padding:.45rem 0;border-bottom:1px solid #EEE}',
      '.pps-entry{font-size:.86rem}',
      '.pps-chips{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.35rem;align-items:center}',
      '.pps-chip{font:500 .74rem Inter,sans-serif;background:#fff;border:1px solid #000;padding:.3rem .5rem;cursor:pointer;text-align:left;display:flex;flex-direction:column;border-radius:0}',
      '.pps-chip span{font-size:.66rem;color:#555}.pps-chip:hover,.pps-chip:focus-visible{background:#000;color:#fff;outline:none}.pps-chip:hover span,.pps-chip:focus-visible span{color:#ddd}',
      '.pps-chip.viol{border-style:dashed;border-color:#B45309}',
      '.pps-unavail{margin-top:.6rem;font-size:.78rem;color:#444}.pps-unavail ul{margin:.2rem 0 0;padding-left:1.1rem}',
      '.pps-avcredits{background:#fff;border:2px solid #000;padding:.6rem .8rem;margin-bottom:.6rem;font-size:.88rem}',
      '.pps-wide{width:100%;margin:.4rem 0}',
      '.pps-avpack{padding:.2rem .8rem .8rem}.pps-avpack ol{margin:.3rem 0;padding-left:1.2rem;font-size:.82rem}.pps-avpack li{margin:.35rem 0}',
      '.pps-small{font-size:.72rem;margin-top:.6rem}',
      '@media (max-width:899px){.pps-avbody{display:block;overflow-y:auto}.pps-avside{border-left:none;border-top:2px solid #000}.pps-avrow{grid-template-columns:1.4rem 1fr}.pps-avact{grid-column:2;align-items:flex-start;text-align:left;flex-direction:row;flex-wrap:wrap}.pps-choose{padding-left:.8rem}.pps-back{font-size:.7rem;padding:.35rem .5rem}}',
      '.pps-advise{background:#fff;border:2px solid #000;border-top:6px solid #CC0000;padding:.6rem 1rem .75rem;margin:0 0 1rem}',
      '.pps-advise h3{margin:0 0 .4rem;font:700 1.05rem "Roboto Slab",Georgia,serif}.pps-advise h3 span{font:400 .8rem Inter,sans-serif;color:#555}',
      '.pps-advise ul{list-style:none;margin:0;padding:0}',
      '.pps-advise li{display:grid;grid-template-columns:3.6rem 1fr;gap:.6rem;align-items:baseline;padding:.3rem 0;border-top:1px solid #EEE;font-size:.84rem;line-height:1.4}',
      '.pps-advise li:first-child{border-top:none}',
      '.pps-lv{font:700 .64rem Inter,sans-serif;text-transform:uppercase;letter-spacing:.06em;text-align:center;padding:.15rem 0;background:#E5E5E5;color:#222}',
      '.lv-stop .pps-lv{background:#CC0000;color:#fff}.lv-warn .pps-lv{background:#FDE68A;color:#78350F}',
      '.pps-msg h3{margin:0 0 .4rem;font:700 1.2rem "Roboto Slab",Georgia,serif}',
      '@media (max-width:899px){.pps-cal{grid-template-columns:2.4rem repeat(var(--cols),minmax(52px,1fr));min-width:0}.pps-cal-head{font-size:.62rem;padding:.35rem .1rem}.pps-ev{font-size:.58rem;padding:.1rem .2rem}.pps-ev strong{font-size:.62rem}.pps-cal-t{font-size:.58rem}.pps-tab{min-width:7.5rem;padding:.45rem .7rem}}',
      '@media (max-width:899px){.pps-body{display:block;overflow-y:auto}.pps-prefs{border-right:none;padding:.75rem 1rem 0}.pps-main{overflow:visible;padding:.75rem 1rem 3rem}.pps-top h2{font-size:1.05rem}.pps-mypack table,.pps-mypack tbody,.pps-mypack tr,.pps-mypack td{display:block}.pps-mypack thead{display:none}.pps-mypack tr{border-bottom:1px solid #C7C7C7;padding:.3rem 0}.pps-mypack td{border:none;padding:.1rem 0}}',
      '@media print{body.pps-open>*:not(#pps-overlay){display:none!important}body.pps-open{overflow:visible}.pps{position:static;background:#fff}.pps-prefs,.pps-x,.pps-tabs,.pps-actions,.pps-search,.pps-cands,.pps-backups,[data-all]{display:none!important}.pps-body{display:block;overflow:visible}.pps-main{overflow:visible}.pps-cal-wrap{overflow:visible}}'
    ].join('\n');
    document.head.appendChild(st);
  }
})();

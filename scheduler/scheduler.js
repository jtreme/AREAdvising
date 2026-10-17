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
  var MODE_TEXT = { P: 'In person', OA: 'Online, no set meeting time', OS: 'Online, scheduled meetings', PH: 'Hybrid', PR: 'In person', IH: 'In person' };
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
  window.PawSched = { open: openBuilder };
  window.addEventListener('pawplan:auditapplied', function () {
    if (ADVISOR && state.autoOpen) { state.autoOpen = false; setTimeout(openBuilder, 150); }
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

  function pickTerm() {
    var plan = B.getPlan(), terms = state.manifest.terms;
    for (var i = 0; i < terms.length; i++) if (plan.some(function (s) { return s.term === terms[i].term; })) return terms[i];
    return terms[terms.length - 1];
  }

  function addToolbarButton() {
    if (document.getElementById('pps-open-btn')) return;
    var anchor = document.getElementById('advising-btn') || document.getElementById('transcript-btn');
    if (!anchor) return;
    var btn = document.createElement('button');
    btn.id = 'pps-open-btn';
    btn.className = 'reset-btn';
    btn.type = 'button';
    btn.innerHTML = buttonLabel(state.manifest.terms[state.manifest.terms.length - 1].term);
    btn.addEventListener('click', openBuilder);
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    injectStyle();
  }

  function buttonLabel(term) { return '&#128197; ' + esc(term) + (ADVISOR ? ' Advising' : ' Schedule') + ' <span class="pps-beta">Beta</span>'; }
  function studentName() { var st = B.getAuditStudent ? B.getAuditStudent() : null; return st && st.name ? st.name : ''; }

  // ---------- open / build ----------
  function openBuilder() {
    injectStyle();
    state.term = pickTerm();
    var btn = document.getElementById('pps-open-btn');
    if (btn) btn.innerHTML = buttonLabel(state.term.term);
    // New student in advisor view: start from clean preferences and no carried-over picks.
    var stu = B.getAuditStudent ? B.getAuditStudent() : null, key = stu ? String(stu.loadedAt) : '';
    if (ADVISOR && key !== state.auditKey) { state.prefs = defaultPrefs(); state.result = null; state.pi = 0; }
    state.auditKey = key;
    shell();
    state.open = true;
    document.body.classList.add('pps-open');
    if (!B.isUploaded()) { renderMessage('Upload your degree audit first', 'The schedule builder works from the ' + state.term.term + ' courses in your Paw Plan. Close this window, click <strong>Upload New Degree Audit</strong>, then come back.'); return; }
    if (state.index && state.index.term === state.term.term) { build(); return; }
    renderMessage('Loading ' + state.term.term + ' classes...', '');
    fetchJSON(BASE + state.term.file + '?v=' + encodeURIComponent(state.term.built || VER), function (err, data) {
      if (err) { renderMessage('Could not load the class schedule', 'Check your connection and try again.'); return; }
      // Department corrections (optional file): courses listed there are treated as not offered.
      fetchJSON(BASE + 'data/overrides.json?v=' + Date.now(), function (e2, ov) {
        state.index = E.prepare(data, e2 ? null : ov);
        build();
      });
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
      busy: p.busy, includeConsent: !!p.includeConsent
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
      '<button type="button" class="pps-x" aria-label="Close schedule builder">&times;</button></div></div>' +
      '<div class="pps-body"><aside class="pps-prefs" aria-label="Preferences"></aside><main class="pps-main"></main></div>';
    document.body.appendChild(o);
    o.querySelector('.pps-x').addEventListener('click', close);
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
      main.innerHTML = '<div class="pps-msg"><h3>No ' + esc(state.index.term) + ' semester in your plan</h3><p>Paw Plan did not place any courses in ' + esc(state.index.term) +
        '. If you are graduating or on leave that term, there is nothing to schedule. Otherwise, check the planning start term you confirmed when you uploaded your audit.</p></div>';
      return;
    }
    var h = '<p class="pps-source">Times and seats from the ' + esc(state.index.term) + ' Schedule of Classes (data from ' + esc(fmtDate(state.term.built)) +
      '). Seats change daily, so confirm every section in MyPack before you register.</p>';
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
        var half = e.m.sec && e.m.sec.session === '8W1' ? '1st 8 weeks' : e.m.sec && e.m.sec.session === '8W2' ? '2nd 8 weeks' : '';
        h += '<div class="pps-ev pps-ev-' + e.kind + '" style="top:' + top + 'px;height:' + ht + 'px;left:calc(' + left + '% + 2px);width:calc(' + w + '% - 4px);--c:' + e.color + '" title="' +
          esc(e.label + ' ' + E.fmtTime(e.m.start) + '-' + E.fmtTime(e.m.end)) + '"><strong>' + esc(e.label) + '</strong>' +
          (ht > 30 ? '<span>' + esc([e.sub, E.fmtTime(e.m.start) + '–' + E.fmtTime(e.m.end)].filter(Boolean).join(' · ')) + '</span>' : '') +
          (half && ht > 44 ? '<span>' + half + '</span>' : '') + '</div>';
      });
      h += '</div>';
    });
    h += '</div></div>';
    var floating = [];
    plan.items.forEach(function (it) { if (!it.unit.meetings.length) floating.push({ code: it.code, cat: it.slot.cat, txt: it.unit.online ? 'Online, no set meeting time' : 'Time to be announced' }); });
    plan.open.forEach(function (o) { if (o.pick && o.pick.groupsFit.every(function (g) { return !g.meetings.length; })) floating.push({ code: o.pick.code, cat: o.slot.cat, txt: 'Online, no set meeting time' }); });
    if (floating.length) h += '<div class="pps-float">' + floating.map(function (f) { return '<span style="--c:' + (CAT_COLORS[f.cat] || '#444') + '"><strong>' + esc(f.code) + '</strong> ' + esc(f.txt) + '</span>'; }).join('') + '</div>';
    return h;
  }

  // ---------- course cards ----------
  function meetText(u) {
    if (!u.meetings.length) return u.online ? 'Online, no set meeting time' : 'Time TBA';
    return u.meetings.map(function (m) {
      var half = m.sec.session === '8W1' ? ' (1st 8 weeks)' : m.sec.session === '8W2' ? ' (2nd 8 weeks)' : '';
      return m.days.map(function (d) { return E.DAY_NAMES[d]; }).join('/') + ' ' + E.fmtTime(m.start) + '–' + E.fmtTime(m.end) + half;
    }).join('; ');
  }
  function secLines(u) {
    return u.sections.map(function (s) {
      var t = s.dayList.length && s.start >= 0 ? s.dayList.map(function (d) { return E.DAY_NAMES[d]; }).join('/') + ' ' + E.fmtTime(s.start) + '–' + E.fmtTime(s.end) : (s.mode === 'OA' ? '' : 'Time TBA');
      return '<div class="pps-sec"><span class="pps-comp">' + esc(s.comp) + ' ' + esc(s.sec) + '</span>' +
        '<span class="pps-nbr" title="Class number for MyPack">' + s.nbr + '</span>' +
        (t ? '<span>' + esc(t) + '</span>' : '') + '<span>' + esc(MODE_TEXT[s.mode] || s.mode) + '</span>' +
        (s.instructor ? '<span>' + esc(s.instructor) + '</span>' : '') +
        '<span>' + Math.max(0, s.avail) + ' of ' + s.cap + ' seats open</span></div>';
    }).join('');
  }
  function violText(v) { return (v || []).map(function (x) { return E.VIOLATION_TEXT[x]; }).join(', '); }

  function itemCard(plan, it, i) {
    var u = it.unit, key = state.pi + ':' + i;
    var flags = [];
    if (it.viol && it.viol.length) flags.push('<span class="pps-flag warn">This section ' + esc(violText(it.viol)) + '</span>');
    if (it.prereq) flags.push('<span class="pps-flag">' + esc(it.prereq) + '</span>');
    if (it.group.note) flags.push('<span class="pps-flag">' + esc(it.group.note) + '</span>');
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
    return '<article class="pps-card" style="--c:' + (CAT_COLORS[it.slot.cat] || '#444') + '"><header><div><h4>' + esc(it.code) + ' <span>' + esc(it.info.lt || it.info.t || '') + '</span></h4>' + req + '</div>' +
      '<div class="pps-when">' + esc(meetText(u)) + '</div></header>' + secLines(u) + (flags.length ? '<div class="pps-flags">' + flags.join('') + '</div>' : '') + others + bh + '</article>';
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
        if (act === 'next') { state.autoOpen = true; close(); if (B.openAuditUpload) B.openAuditUpload(); return; }
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
    r.notes.forEach(function (n) { if (!n.severe) add('warn', n.text); });
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
      if (it.group.note) add('info', it.code + ': ' + it.group.note + '.');
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
    t.push('Seats change daily. Confirm each section in MyPack before you enroll.');
    return t.join('\n');
  }

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
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

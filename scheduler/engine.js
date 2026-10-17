/* Paw Plan schedule engine.
 * Pure logic: no DOM. Turns one semester of a Paw Plan into ranked, conflict-free
 * section schedules using a Schedule of Classes data file (see tools/build_schedule_data.py).
 *
 * Pass 1 schedules required courses and small either/or choices (ARE 303/304 etc.).
 * Pass 2 fills open requirements (Humanities, electives) from the gaps pass 1 leaves.
 */
(function (root) {
  'use strict';

  var DAY_TOKENS = [['Th', 3], ['Sa', 5], ['Su', 6], ['M', 0], ['T', 1], ['W', 2], ['F', 4], ['S', 5]];
  var DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var STANDING_ORDER = { FR: 0, SO: 1, JR: 2, SR: 3 };
  var CHOICE_MAX = 6; // either/or lists longer than this are interest-driven electives -> pass 2
  var OPEN_PICKERS = { hum: 1, socsci: 1, gepelec: 1, ids: 1, tech: 1, depttech: 1, free: 1, are3xx: 1, are4xx: 1, hesf1: 1, hesf2: 1, natsci3: 1, natsci4: 1 };
  var CODE_RE = /^[A-Z]{1,4} \d{3}[A-Z]?$/;
  // Department rule: never suggest a Poole College course over an ARE course for the same
  // requirement (EC 301 is never offered in place of ARE 301; BUS 320 never over ARE 321/323).
  var POOLE = { EC: 1, BUS: 1, ACC: 1, MIE: 1, MBA: 1 };
  function isPoole(code) { return !!POOLE[String(code).split(' ')[0]]; }
  function isARE(code) { return String(code).split(' ')[0] === 'ARE'; }
  function preferARE(options, available) {
    // options: [[code,...],...]; available(code) -> bool. Drop all-Poole options when an ARE option is available.
    var hasARE = options.some(function (o) { return o.some(isARE) && o.every(available); });
    return hasARE ? options.filter(function (o) { return !o.every(isPoole); }) : options;
  }
  // Paw Plan suggests a first choice only for short GEP lists. Broad elective lists
  // (technical, departmental, GEP elective, free) are the student's call, so no auto-pick.
  var SUGGEST_PICKERS = { hum: 1, socsci: 1, ids: 1, hesf1: 1, hesf2: 1 };

  function parseDays(s) {
    var out = [], i = 0;
    s = s || '';
    while (i < s.length) {
      var hit = false;
      for (var k = 0; k < DAY_TOKENS.length; k++) {
        var tok = DAY_TOKENS[k][0];
        if (s.substr(i, tok.length) === tok) { out.push(DAY_TOKENS[k][1]); i += tok.length; hit = true; break; }
      }
      if (!hit) i++;
    }
    return out;
  }

  function fmtTime(m) {
    if (m < 0) return 'TBA';
    var h = Math.floor(m / 60), mi = m % 60, ap = h >= 12 ? 'pm' : 'am';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + (mi < 10 ? '0' : '') + mi + ap;
  }

  function standingFromCredits(cr) { return cr >= 90 ? 'SR' : cr >= 60 ? 'JR' : cr >= 30 ? 'SO' : 'FR'; }

  // ---------- Data preparation ----------
  // overrides: department corrections to the Schedule of Classes, e.g.
  // { "Spring 2027": { "notOffered": ["ARE 312"] } } for a course the department knows will not run.
  function prepare(data, overrides) {
    var F = data.fields, idx = {};
    F.forEach(function (f, i) { idx[f] = i; });
    var ov = (overrides && overrides[data.term]) || {}, skip = {};
    var subs = (overrides && overrides.substitutions) || {};
    (ov.notOffered || []).forEach(function (c) { skip[String(c).trim().toUpperCase()] = 1; });
    var byCourse = {};
    data.sections.forEach(function (r) {
      if (skip[r[idx.code]]) return;
      var s = {};
      F.forEach(function (f) { s[f] = r[idx[f]]; });
      s.dayList = parseDays(s.days);
      (byCourse[s.code] = byCourse[s.code] || []).push(s);
    });
    var courses = {};
    Object.keys(byCourse).forEach(function (code) {
      courses[code] = { code: code, info: data.courses[code] || {}, sections: byCourse[code], units: buildUnits(code, byCourse[code]) };
    });
    var prefixes = {};
    Object.keys(courses).forEach(function (c) { prefixes[c.split(' ')[0]] = 1; });
    return { term: data.term, built: data.built, source: data.source, courses: courses, prefixes: Object.keys(prefixes).sort(), subs: subs };
  }

  // An enrollable unit = one section of each component type sharing an Assoc Class number
  // (e.g. EC 202 lecture 001 + one Friday recitation; ACC 210 lecture + one problem session).
  function buildUnits(code, sections) {
    var byAssoc = {};
    sections.forEach(function (s) { (byAssoc[s.assoc] = byAssoc[s.assoc] || []).push(s); });
    var units = [];
    Object.keys(byAssoc).forEach(function (a) {
      var byComp = {}, order = [];
      byAssoc[a].forEach(function (s) {
        if (!byComp[s.comp]) { byComp[s.comp] = []; order.push(s.comp); }
        byComp[s.comp].push(s);
      });
      // Lecture-type component first so the unit reads naturally.
      order.sort(function (x, y) { return rankComp(x) - rankComp(y); });
      var combos = [[]];
      order.forEach(function (comp) {
        var next = [];
        combos.forEach(function (c) { byComp[comp].forEach(function (s) { if (next.length < 600) next.push(c.concat([s])); }); });
        combos = next;
      });
      combos.forEach(function (secs) { units.push(makeUnit(code, secs)); });
    });
    return units;
  }
  function rankComp(c) { return { LEC: 0, SEM: 1, ACT: 1, STD: 1, LAB: 2, LLB: 2, REC: 3, PRB: 3 }[c] !== undefined ? { LEC: 0, SEM: 1, ACT: 1, STD: 1, LAB: 2, LLB: 2, REC: 3, PRB: 3 }[c] : 4; }

  function makeUnit(code, secs) {
    var meetings = [], modes = {}, status = 0, consent = 0, restr = [], minAvail = Infinity;
    secs.forEach(function (s) {
      modes[s.mode] = 1;
      if (s.status === 1 || s.status === 3) status = Math.max(status, s.status);
      consent = Math.max(consent, s.consent);
      if (s.restrict && restr.indexOf(s.restrict) === -1) restr.push(s.restrict);
      minAvail = Math.min(minAvail, s.avail);
      if (s.dayList.length && s.start >= 0 && s.end > s.start) {
        meetings.push({ days: s.dayList, start: s.start, end: s.end, d0: s.startDay, d1: s.endDay, sec: s, code: code });
      }
    });
    var allOnlineAsync = secs.every(function (s) { return s.mode === 'OA'; });
    var onlineAny = secs.some(function (s) { return s.mode === 'OA' || s.mode === 'OS'; });
    var timeKey = meetings.map(function (m) { return m.days.join('') + '@' + m.start + '-' + m.end + '/' + m.d0 + '-' + m.d1; }).sort().join('|') +
      (meetings.length ? '' : (allOnlineAsync ? 'ONLINE' : 'TBA')) + '#' + (onlineAny ? 'o' : 'p');
    return {
      code: code, sections: secs, meetings: meetings, timeKey: timeKey,
      online: allOnlineAsync, onlineAny: onlineAny, hybrid: !!modes.PH,
      tba: !meetings.length && !allOnlineAsync,
      status: status, consent: consent, restrict: restr, avail: minAvail === Infinity ? 0 : minAvail,
      honors: secs.some(function (s) { return /H$/.test(s.sec); }),
      tentative: secs.some(function (s) { return s.status === 2; }),
      session: secs[0].session, units: secs[0].units
    };
  }

  // ---------- Eligibility ----------
  // Returns {ok, note}. Conservative: anything we can't read as open to an ABM student is excluded.
  function checkRestriction(text, student) {
    var t = (text || '').trim();
    if (!t) return { ok: true };
    var low = t.toLowerCase();
    if (/honors|scholars/.test(low)) return { ok: false, note: 'Honors / Scholars only' };
    if (/outside of the eng|non-?engineering|no pcom|non-?majors?\b|not open to/.test(low)) return { ok: true };
    var minStand = null;
    if (/sophomore|\bso\b/.test(low)) minStand = 'SO';
    if (/junior|\bjr\b/.test(low)) minStand = minStand || 'JR';
    if (/senior|\bsr\b/.test(low) && !minStand) minStand = 'SR';
    var gpa = low.match(/gpa\s*(?:>|>=|of|above)?\s*(\d\.\d+)/);
    // Strip what we understand; whatever is left is a restriction we cannot verify.
    // ABM students are CALS undergraduates, so "Undergraduate Students CALS" is open to them.
    var rest = low.replace(/^[rpx]\s*:/, '').replace(/11agbusbs|agri ?business|abm/g, '')
      .replace(/college of agriculture (and|&) life sciences|\bcals\b|undergrad(uate)?s?|\bstu\b/g, '')
      .replace(/juniors?|seniors?|sophomores?|freshm[ae]n|\b(so|jr|sr)\b|standing|or above|and up|\(i.*$/g, '')
      .replace(/gpa\s*[>=]*\s*\d\.\d+/g, '').replace(/\b(only|and|or|students?|class)\b/g, '').replace(/[^a-z0-9]/g, '');
    if (rest) return { ok: false, note: 'Restricted: ' + t };
    if (minStand && STANDING_ORDER[student.standing] < STANDING_ORDER[minStand]) return { ok: false, note: 'Requires ' + { SO: 'sophomore', JR: 'junior', SR: 'senior' }[minStand] + ' standing' };
    if (gpa && student.gpa != null && student.gpa <= parseFloat(gpa[1])) return { ok: false, note: 'Requires GPA above ' + gpa[1] };
    if (gpa && student.gpa == null) return { ok: true, note: 'GPA requirement: ' + t };
    return { ok: true };
  }

  function unitEligibility(u, student, opts) {
    if (u.status === 1 || u.status === 3) return { ok: false, note: 'Closed' };
    if (u.tentative) return { ok: false, note: 'Tentative section (not offered)' };
    if (u.honors) return { ok: false, note: 'Honors section' };
    if (u.consent && !opts.includeConsent) return { ok: false, note: u.consent === 1 ? 'Instructor consent required' : 'Department consent required' };
    var notes = [];
    for (var i = 0; i < u.restrict.length; i++) {
      var r = checkRestriction(u.restrict[i], student);
      if (!r.ok) return r;
      if (r.note) notes.push(r.note);
    }
    return { ok: true, note: notes.join('; ') };
  }

  // Loose prerequisite check from catalog text such as "P:ARE 201 or EC 201 or EC 205" or
  // "P: ST/BUS 350 or ST 311". Flags (never blocks) when none of the listed courses is on record.
  function prereqFlag(info, taken) {
    var req = (info && info.req) || '';
    var m = req.match(/P(?:\s*or\s*C)?\s*:\s*([^;]*)/i);
    if (!m) return '';
    var part = m[1].replace(/\b([A-Z]{1,4})\/([A-Z]{1,4}) (\d{3})/g, '$1 $3 or $2 $3');
    var codes = part.match(/\b[A-Z]{1,4} \d{3}\b/g);
    if (!codes) return '';
    for (var i = 0; i < codes.length; i++) if (taken[codes[i]]) return '';
    return 'Check prerequisite: ' + req;
  }

  // ---------- Conflicts and scoring ----------
  function meetConflict(a, b) {
    if (a.start >= b.end || b.start >= a.end) return false;
    if (a.d0 && b.d0 && (a.d1 < b.d0 || b.d1 < a.d0)) return false;
    for (var i = 0; i < a.days.length; i++) if (b.days.indexOf(a.days[i]) !== -1) return true;
    return false;
  }
  function unitConflicts(u, meetings) {
    for (var i = 0; i < u.meetings.length; i++)
      for (var j = 0; j < meetings.length; j++)
        if (meetConflict(u.meetings[i], meetings[j])) return true;
    return false;
  }

  // Preference violations for a unit (used as hard filters, relaxed to penalties if nothing fits).
  function prefViolations(u, prefs) {
    var v = [];
    u.meetings.forEach(function (m) {
      if (prefs.earliest && m.start < prefs.earliest && v.indexOf('early') === -1) v.push('early');
      if (prefs.latest && m.end > prefs.latest && v.indexOf('late') === -1) v.push('late');
      if (prefs.noFriday && m.days.indexOf(4) !== -1 && v.indexOf('friday') === -1) v.push('friday');
    });
    if (prefs.online === 'avoid' && u.onlineAny) v.push('online');
    if (prefs.online === 'only' && !u.onlineAny) v.push('inperson');
    return v;
  }
  var VIOLATION_TEXT = { early: 'starts before your earliest time', late: 'ends after your latest time', friday: 'meets on Friday', online: 'is online', inperson: 'is in person' };

  // Additive part of the score (monotone, usable as a branch-and-bound lower bound).
  function unitCost(u, prefs, relaxed) {
    var c = 0;
    u.meetings.forEach(function (m) { if (m.start >= 17 * 60) c += 1.5; });
    // Online counts about like one campus day, so "allow" stays neutral between formats.
    if (u.onlineAny) c += prefs.online === 'prefer' ? -3 : 3;
    if (u.tba) c += 1;
    if (relaxed) c += prefViolations(u, prefs).length * 12;
    return c;
  }

  function dayStats(units) {
    var byDay = {};
    units.forEach(function (u) { u.meetings.forEach(function (m) { m.days.forEach(function (d) { (byDay[d] = byDay[d] || []).push(m); }); }); });
    var days = Object.keys(byDay).length, gap = 0;
    Object.keys(byDay).forEach(function (d) {
      var ms = byDay[d].slice().sort(function (a, b) { return a.start - b.start; });
      for (var i = 1; i < ms.length; i++) { var g = ms[i].start - ms[i - 1].end; if (g > 30) gap += (g - 15) / 60; }
    });
    return { days: days, gap: gap };
  }
  function scoreUnits(units, prefs, relaxed) {
    var st = dayStats(units), c = st.days * 4 + st.gap * 1.5;
    units.forEach(function (u) { c += unitCost(u, prefs, relaxed); });
    return c;
  }

  // ---------- Slot classification ----------
  function listCodes(groups) {
    var out = [];
    (groups || []).forEach(function (g) { (g.courses || []).forEach(function (c) { if (c && c.c) out.push(c.c); }); if (g && g.c) out.push(g.c); });
    return out;
  }
  function optionFromLabel(label) {
    // "BIO 105 + BIO 106" -> ['BIO 105','BIO 106']; "CH 101" -> ['CH 101']
    var parts = String(label).split('+').map(function (s) { return s.trim(); });
    return parts.every(function (p) { return CODE_RE.test(p); }) ? parts : null;
  }
  function expandSlashCode(code) {
    // "EC/ARE 301" -> EC 301, ARE 301 ; "ARE 306/309" -> ARE 306, ARE 309
    var m = code.match(/^([A-Z]{1,4})\/([A-Z]{1,4}) (\d{3})$/);
    if (m) return [[m[1] + ' ' + m[3]], [m[2] + ' ' + m[3]]];
    m = code.match(/^([A-Z]{1,4}) (\d{3})(?:\/(\d{3}))+$/);
    if (m) return code.split(' ')[1].split('/').map(function (n) { return [m[1] + ' ' + n]; });
    return null;
  }

  // Department substitutions, e.g. { "AEE 226": ["ARE 255"] }: the substitute is offered first
  // wherever the original course is an option.
  function withSubs(options, subs) {
    if (!subs) return options;
    var out = [], seen = {};
    options.forEach(function (o) {
      if (o.length === 1 && subs[o[0]]) subs[o[0]].forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push([x]); } });
    });
    options.forEach(function (o) { var k = o.join('+'); if (!seen[k]) { seen[k] = 1; out.push(o); } });
    return out;
  }
  function classifySlots(semester, si, lists, subs) {
    var slots = [];
    semester.courses.forEach(function (c, ci) {
      var code = String(c.code || '').trim();
      var base = { si: si, ci: ci, label: code, name: c.name || '', units: c.units || 3, cat: c.cat || 'free', picker: c.picker || '', tag: c.tag || '',
        pin: c.sched && c.sched.nbrs ? c.sched.nbrs : null };
      // Planned at another school (community college, summer elsewhere): not scheduled here.
      if (c.transferPlan) { base.kind = 'transfer'; base.transferPlan = c.transferPlan; slots.push(base); return; }
      // A course the student picked in the audit view stays exactly as picked (no substitutions or alternatives).
      if (c.sched && c.sched.codes && c.sched.codes.length) { base.kind = 'fixed'; base.options = [c.sched.codes.slice()]; slots.push(base); return; }
      var opt = optionFromLabel(code);
      if (opt) {
        base.options = withSubs([opt], subs);
        base.kind = base.options.length > 1 ? 'choice' : 'fixed';
        slots.push(base); return;
      }
      // "ACC 200 or ACC 210", "AEE 226 or CSC 200", "ALS 103/303 or ARE 290": every listed course is an option.
      var orParts = / or /.test(code) && !c.picker ? [].concat.apply([], code.split(/,| or /).map(function (x) {
        x = x.trim(); return expandSlashCode(x) || (CODE_RE.test(x) ? [[x]] : []);
      })) : null;
      var slash = expandSlashCode(code) || orParts;
      if (slash && slash.length && !c.picker) { base.kind = 'choice'; base.options = withSubs(slash, subs); slots.push(base); return; }
      var pk = c.picker;
      if (pk && lists.SLASH_COURSES[pk] && !OPEN_PICKERS[pk] && lists.SLASH_COURSES[pk].length <= CHOICE_MAX) {
        base.kind = 'choice';
        base.options = withSubs(lists.SLASH_COURSES[pk].map(function (o) { return optionFromLabel(o.c); }).filter(Boolean), subs);
        slots.push(base); return;
      }
      if (pk) {
        base.kind = 'open';
        base.pool = pk === 'free' ? null : poolForPicker(pk, lists);
        base.isFree = pk === 'free';
        slots.push(base); return;
      }
      base.kind = 'note';
      slots.push(base);
    });
    return slots;
  }

  function poolForPicker(pk, lists) {
    var codes = [];
    if (pk === 'hum') codes = listCodes(lists.HUM_COURSES);
    else if (pk === 'socsci') codes = listCodes(lists.SOCSCI_COURSES);
    else if (pk === 'gepelec') codes = listCodes(lists.GEP_ELEC_COURSES);
    else if (pk === 'ids') codes = listCodes(lists.IDS_COURSES);
    else if (pk === 'tech') codes = listCodes(lists.TECH_ELECTIVE_LIST);
    else if (pk === 'depttech') codes = (lists.DEPT_VALID_CODES || []).concat(listCodes(lists.TECH_ELECTIVE_LIST));
    else if (lists.SLASH_COURSES[pk]) {
      var opts = [];
      lists.SLASH_COURSES[pk].forEach(function (o) { var op = optionFromLabel(o.c); if (op) opts.push(op); });
      return { options: opts, prefixes: null };
    }
    var seen = {}, opts2 = [];
    codes.forEach(function (c) { if (CODE_RE.test(c) && !seen[c]) { seen[c] = 1; opts2.push([c]); } });
    return { options: opts2, prefixes: pk === 'tech' || pk === 'depttech' ? (lists.TECH_PREFIXES || []) : null };
  }

  // ---------- Context ----------
  function buildContext(index, plan, lists, input) {
    input = input || {};
    var si = -1;
    plan.forEach(function (s, i) { if (s.term === index.term) si = i; });
    var taken = {}, priorCredits = 0, allCodes = {};
    var target = termRank(index.term);
    plan.forEach(function (s) {
      // Anything finished or underway before the target term counts as taken
      // (completed, transfer, in-progress buckets, and earlier named terms such as "Fall 2026").
      var r = termRank(s.term);
      var prior = /^(Completed NC State|Prior NC State|Transfer|In Progress)/.test(s.term) || (r !== null && target !== null && r < target);
      s.courses.forEach(function (c) {
        var codes = String(c.code || '').split('+').map(function (x) { return x.trim(); }).filter(function (x) { return CODE_RE.test(x); });
        codes.forEach(function (x) { allCodes[x] = 1; if (prior) taken[x] = 1; });
        if (prior) priorCredits += Number(c.units) || 0;
      });
    });
    (input.transferred || []).forEach(function (c) { if (CODE_RE.test(c.code)) { taken[c.code] = 1; allCodes[c.code] = 1; } });
    var gk = (lists.VERIFY_GLOBAL_KNOWLEDGE || []).some(function (c) { return allCodes[c]; });
    var ad = (lists.VERIFY_AMER_DEMOCRACY || []).some(function (c) { return allCodes[c]; });
    var autoStanding = standingFromCredits(priorCredits);
    return {
      si: si, taken: taken, allCodes: allCodes, priorCredits: priorCredits,
      student: { standing: input.standing || autoStanding, autoStanding: autoStanding, gpa: input.gpa != null ? input.gpa : null },
      needGK: !gk, needAD: !ad,
      gkSet: toSet(lists.VERIFY_GLOBAL_KNOWLEDGE), adSet: toSet(lists.VERIFY_AMER_DEMOCRACY)
    };
  }
  function termRank(t) {
    var m = String(t || '').match(/^(Spring|Summer|Fall)\b.*?(\d{4})/);
    return m ? (+m[2]) * 3 + { Spring: 0, Summer: 1, Fall: 2 }[m[1]] : null;
  }
  function toSet(a) { var o = {}; (a || []).forEach(function (x) { o[x] = 1; }); return o; }

  // Time groups: eligible units of a course collapsed by identical meeting pattern.
  // Sections in the same group are interchangeable backups ("same time").
  function courseGroups(index, code, ctx, prefs, busy, opts) {
    var c = index.courses[code];
    if (!c) return { offered: false, groups: [], excluded: [] };
    var groups = {}, excluded = {};
    c.units.forEach(function (u) {
      var el = unitEligibility(u, ctx.student, opts);
      if (!el.ok) { excluded[el.note] = (excluded[el.note] || 0) + 1; return; }
      if (unitConflicts(u, busy)) { excluded['Conflicts with your busy times'] = (excluded['Conflicts with your busy times'] || 0) + 1; return; }
      var g = groups[u.timeKey];
      if (!g) g = groups[u.timeKey] = { code: code, timeKey: u.timeKey, units: [], meetings: u.meetings, rep: u, viol: prefViolations(u, prefs), note: el.note };
      g.units.push(u);
    });
    var list = Object.keys(groups).map(function (k) { return groups[k]; });
    list.forEach(function (g) {
      g.units.sort(function (a, b) { return b.avail - a.avail; });
      g.rep = g.units[0];
      g.seats = g.units.reduce(function (t, u) { return t + Math.max(0, u.avail); }, 0);
    });
    return { offered: true, groups: list, excluded: excluded, info: c.info };
  }

  // ---------- Pass 1 search ----------
  function searchCombo(items, prefs, relaxed, nodeCap, accept) {
    // items: [{code, groups}] ; returns best {choice:[group...], score}
    var order = items.map(function (it, i) { return i; }).sort(function (a, b) { return items[a].groups.length - items[b].groups.length; });
    var best = null, nodes = 0, chosen = new Array(items.length), meetings = [];
    var sortedGroups = items.map(function (it) {
      return it.groups.filter(function (g) { return relaxed || !g.viol.length; })
        .map(function (g) { return { g: g, cost: unitCost(g.rep, prefs, relaxed) }; })
        .sort(function (a, b) { return a.cost - b.cost; });
    });
    function rec(k, partial, daySet) {
      if (nodes++ > nodeCap) return;
      if (k === order.length) {
        var units = chosen.map(function (g) { return g.rep; });
        if (accept && !accept(chosen)) return;
        var sc = scoreUnits(units, prefs, relaxed);
        if (!best || sc < best.score) best = { choice: chosen.slice(), score: sc };
        return;
      }
      var i = order[k], cand = sortedGroups[i];
      for (var j = 0; j < cand.length; j++) {
        var g = cand[j].g;
        // Lower bound: additive costs so far + 4 per distinct day.
        var nd = daySet.slice();
        g.meetings.forEach(function (m) { m.days.forEach(function (d) { if (nd.indexOf(d) === -1) nd.push(d); }); });
        var bound = partial + cand[j].cost + nd.length * 4;
        if (best && bound >= best.score) continue;
        if (unitConflicts(g.rep, meetings)) continue;
        chosen[i] = g;
        var before = meetings.length;
        for (var q = 0; q < g.meetings.length; q++) meetings.push(g.meetings[q]);
        rec(k + 1, partial + cand[j].cost, nd);
        meetings.length = before;
        if (nodes > nodeCap) return;
      }
    }
    rec(0, 0, []);
    return best;
  }

  function cartesian(lists, cap) {
    var out = [[]];
    lists.forEach(function (l) {
      var next = [];
      out.forEach(function (o) { l.forEach(function (x) { if (next.length < cap) next.push(o.concat([x])); }); });
      out = next;
    });
    return out;
  }

  // Main entry. Returns {ok, plans, slots, notes, ctx}
  function buildSchedules(index, plan, lists, prefs, input) {
    prefs = prefs || {};
    var opts = { includeConsent: !!prefs.includeConsent };
    var ctx = buildContext(index, plan, lists, input);
    if (ctx.si === -1) return { ok: false, reason: 'no-semester', term: index.term };
    var busy = (prefs.busy || []).map(function (b) { return { days: b.days, start: b.start, end: b.end, d0: 0, d1: 0, busy: true }; });
    var slots = classifySlots(plan[ctx.si], ctx.si, lists, index.subs);
    var notes = [], p1 = [], open = [];
    var cache = {};
    function groupsFor(code) { if (!cache[code]) cache[code] = courseGroups(index, code, ctx, prefs, busy, opts); return cache[code]; }

    slots.forEach(function (s) {
      if (s.kind === 'note') { notes.push({ slot: s, text: s.label + ': not a specific course, so it is not scheduled. Talk with your advisor about what fills it.' }); return; }
      if (s.kind === 'transfer') { var tp = s.transferPlan; notes.push({ slot: s, transfer: true, text: s.label + ': planned at ' + (tp.school || 'another school') + (tp.course ? ' (' + tp.course + ')' : '') + (tp.term ? ', ' + tp.term : '') + '. Confirm it transfers before enrolling.' }); return; }
      // Already met by a course on record (including a department substitution such as ARE 255 for AEE 226).
      var metBy = null;
      (s.options || []).forEach(function (o) { if (!metBy && o.every(function (x) { return ctx.taken[x]; })) metBy = o.join(' + '); });
      if (metBy) { notes.push({ slot: s, text: s.label + ': ' + metBy + ' is already on your record and fills this. Confirm it shows on the audit.' }); return; }
      if (s.kind === 'open') { open.push(s); return; }
      // fixed or choice: keep options whose every course has eligible sections and is not already taken
      var usable = [], dropped = [];
      s.options.forEach(function (opt) {
        var already = opt.some(function (c) { return ctx.taken[c]; });
        if (already) { dropped.push({ opt: opt, why: opt.join(' + ') + ' is already on your record' }); return; }
        var bad = null;
        opt.forEach(function (c) {
          var g = groupsFor(c);
          if (!g.offered) bad = bad || c + ' is not offered in ' + index.term;
          else if (!g.groups.length) bad = bad || c + ' has no open sections you are eligible for (' + Object.keys(g.excluded).join('; ') + ')';
        });
        if (bad) dropped.push({ opt: opt, why: bad }); else usable.push(opt);
      });
      usable = preferARE(usable, function (c) { return groupsFor(c).groups.length > 0; });
      s.dropped = dropped; s.usable = usable;
      s.usableInfo = usable.map(function (opt) { return { option: opt, prereq: opt.map(function (c) { return prereqFlag((index.courses[c] || {}).info, ctx.taken); }).filter(Boolean).join(' ') }; });
      if (!usable.length) {
        notes.push({ slot: s, text: s.label + ': ' + (dropped.map(function (d) { return d.why; }).join('. ') || 'nothing offered') + '. It cannot go in this semester; consider moving it to another term in Paw Plan.' , severe: true });
        return;
      }
      p1.push(s);
    });

    // Course-set combinations from choice slots (no course used twice).
    var combos = cartesian(p1.map(function (s) { return s.usable; }), 400).filter(function (combo) {
      var seen = {};
      for (var i = 0; i < combo.length; i++) for (var j = 0; j < combo[i].length; j++) { if (seen[combo[i][j]]) return false; seen[combo[i][j]] = 1; }
      return true;
    });

    // A section the student already picked (audit view) is pinned: only that time group is
    // used, with the picked section as its first choice and same-time sections as backups.
    function pinnedGroups(code, pin) {
      var gs = groupsFor(code).groups;
      if (!pin) return gs;
      for (var i = 0; i < gs.length; i++) {
        for (var j = 0; j < gs[i].units.length; j++) {
          var u = gs[i].units[j], key = u.sections.map(function (x) { return x.nbr; }).join('+');
          if (pin.indexOf(key) !== -1) {
            var g = Object.assign({}, gs[i]);
            g.units = [u].concat(gs[i].units.filter(function (x) { return x !== u; }));
            g.rep = u;
            return [g];
          }
        }
      }
      return gs;
    }
    function itemsFor(combo) {
      var items = [];
      combo.forEach(function (opt, i) { opt.forEach(function (code) { items.push({ code: code, slot: p1[i], groups: pinnedGroups(code, p1[i].pin) }); }); });
      return items;
    }
    function runAll(relaxed) {
      var res = [];
      combos.forEach(function (combo) {
        var items = itemsFor(combo);
        var best = searchCombo(items, prefs, relaxed, 40000);
        var pre = 0, nonARE = 0;
        items.forEach(function (it) {
          if (prereqFlag((index.courses[it.code] || {}).info, ctx.taken)) pre++;
          // Department preference: when a requirement has an ARE option, choosing something else counts against the mix.
          if (!isARE(it.code) && (it.slot.usable || []).some(function (o) { return o.some(isARE); })) nonARE++;
        });
        if (best) res.push({ combo: combo, items: items, best: best, prereqCount: pre, nonARE: nonARE, key: combo.map(function (o) { return o.join('+'); }).join(',') });
      });
      // Course mixes the student is ready for come first, then ARE courses where there is a choice.
      return res.sort(function (a, b) { return a.prereqCount - b.prereqCount || a.nonARE - b.nonARE || a.best.score - b.best.score; });
    }
    var relaxed = false, results = runAll(false);
    if (!results.length && p1.length) { relaxed = true; results = runAll(true); }

    var dropNote = null;
    if (!results.length && p1.length) {
      // Find the course whose removal makes a schedule possible.
      // Leave out an unpicked course before ever leaving out a section the student picked.
      var dropOrder = p1.map(function (_, i) { return i; }).sort(function (a, b) { return (p1[a].pin ? 1 : 0) - (p1[b].pin ? 1 : 0); });
      for (var di = 0; di < dropOrder.length && !results.length; di++) {
        var d = dropOrder[di];
        var keep = p1.filter(function (_, i) { return i !== d; });
        var sub = cartesian(keep.map(function (s) { return s.usable; }), 200);
        var save = p1; p1 = keep; combos = sub;
        results = runAll(true);
        p1 = save;
        if (results.length) relaxed = true;
        if (results.length) dropNote = { slot: save[d], text: 'No conflict-free schedule includes ' + save[d].label + ' with your other courses' + (p1.some(function (x) { return x.pin; }) ? ', picked sections,' : '') + ' and busy times. These plans leave it out; change a conflicting pick, look at its sections below, or move it to another term.' };
      }
    }
    if (dropNote) notes.push(dropNote);

    var plans = [];
    if (results.length || !p1.length) {
      var A = results[0] ? materialize(results[0], 'A') : { label: 'Plan A', items: [], score: 0 };
      plans.push(A);
      // Plan B / C: a different course mix when one exists, otherwise a substantially different set of times.
      var used = [results[0] ? results[0].key : ''];
      [1, 2].forEach(function (n) {
        var alt = null;
        for (var r = 1; r < results.length; r++) if (used.indexOf(results[r].key) === -1 && results[r].prereqCount <= results[0].prereqCount && results[r].nonARE <= results[0].nonARE) { alt = results[r]; break; }
        if (alt) { used.push(alt.key); var pl = materialize(alt, String.fromCharCode(65 + n)); pl.kind = 'courses'; pl.diff = courseDiff(A, pl); plans.push(pl); return; }
        if (!results[0]) return;
        var prior = plans.map(function (p) { return p.items.map(function (it) { return it.code + '|' + it.group.timeKey; }); });
        var base = results[0];
        var movable = base.items.filter(function (it) { return it.groups.filter(function (g) { return relaxed || !g.viol.length; }).length > 1; }).length;
        if (!movable) return;
        var minDiff = Math.max(1, Math.ceil(movable / 2));
        var best = searchCombo(base.items, prefs, relaxed, 60000, function (chosen) {
          return prior.every(function (keys) {
            var diff = 0;
            chosen.forEach(function (g, i) { if (keys.indexOf(base.items[i].code + '|' + g.timeKey) === -1) diff++; });
            return diff >= minDiff;
          });
        });
        if (best) { var pl2 = materialize({ combo: base.combo, items: base.items, best: best }, String.fromCharCode(65 + n)); pl2.kind = 'times'; plans.push(pl2); }
      });
    }

    function materialize(res, letter) {
      var items = res.items.map(function (it, i) {
        var g = res.best.choice[i];
        return { code: it.code, slot: it.slot, group: g, unit: g.rep, info: (index.courses[it.code] || {}).info || {}, prereq: prereqFlag((index.courses[it.code] || {}).info, ctx.taken) };
      });
      return { label: 'Plan ' + letter, letter: letter, kind: 'best', items: items, score: res.best.score, relaxed: relaxed, credits: creditsOf(items), open: [] };
    }
    function creditsOf(items) {
      var seen = {}, cr = 0;
      items.forEach(function (it) { if (!seen[it.slot.ci]) { seen[it.slot.ci] = 1; cr += Number(it.slot.units) || 0; } });
      return cr;
    }
    function pickMeetings(pick) { var m = []; pick.groupsFit.forEach(function (g) { m = m.concat(g.meetings); }); return m; }
    function occupiedExcept(p, skipItem, skipOpen) {
      var occ = busy.slice(), used = {};
      p.items.forEach(function (it) { if (it !== skipItem) occ = occ.concat(it.unit.meetings); used[it.code] = 1; });
      p.open.forEach(function (o) { if (o !== skipOpen && o.pick) { occ = occ.concat(pickMeetings(o.pick)); o.pick.option.forEach(function (c) { used[c] = 1; }); } });
      return { occ: occ, used: used };
    }
    function backupsFor(it, others) {
      var same = it.group.units.filter(function (u) { return u !== it.unit; }).map(function (u) { return { unit: u, group: it.group, same: true, viol: it.group.viol }; });
      var diff = [];
      groupsFor(it.code).groups.forEach(function (g) {
        if (g === it.group) return;
        if (unitConflicts(g.rep, others)) return;
        g.units.forEach(function (u) { diff.push({ unit: u, group: g, same: false, viol: g.viol }); });
      });
      diff.sort(function (a, b) { return a.viol.length - b.viol.length || unitCost(a.unit, prefs, true) - unitCost(b.unit, prefs, true) || b.unit.avail - a.unit.avail; });
      return same.concat(diff);
    }
    // Recompute backups and open-requirement fits after any change to a plan.
    function refresh(p) {
      p.open.forEach(function (o) {
        if (!o.pick) return;
        var oc = occupiedExcept(p, null, o);
        if (pickMeetings(o.pick).some(function (m) { return oc.occ.some(function (x) { return meetConflict(m, x); }); })) { o.pick = null; o.dropped = true; }
      });
      p.items.forEach(function (it) {
        var oc = occupiedExcept(p, it, null);
        it.backups = backupsFor(it, oc.occ.filter(function (m) { return !m.busy; }));
        it.viol = prefViolations(it.unit, prefs);
      });
      p.open.forEach(function (o) {
        var oc = occupiedExcept(p, null, o);
        o.candidates = o.slot.isFree ? [] : openCandidates(o.slot, oc.occ, oc.used);
      });
      p.credits = creditsOf(p.items);
      return p;
    }

    // Pass 2: open slots, per plan. Suggest a first choice for each, in order, so suggestions don't collide.
    plans.forEach(function (p) {
      p.open = open.map(function (s) { return { slot: s, candidates: [], pick: null }; });
      p.open.forEach(function (o) {
        if (o.slot.isFree || !SUGGEST_PICKERS[o.slot.picker]) return;
        var oc = occupiedExcept(p, null, o);
        var cands = openCandidates(o.slot, oc.occ, oc.used);
        for (var i = 0; i < cands.length; i++) if (!cands[i].viol && !cands[i].prereq) { o.pick = cands[i]; o.suggested = true; break; }
      });
      refresh(p);
    });

    function openCandidates(s, occupied, usedCodes) {
      var out = [];
      s.pool.options.forEach(function (opt) {
        if (opt.some(function (c) { return ctx.allCodes[c] || usedCodes[c]; })) return;
        var c = candidateFor(opt, occupied);
        if (c) out.push(c);
      });
      return rankCandidates(out);
    }
    function candidateFor(opt, occupied) {
      // For bundles every course must fit; we pair the first fitting group of each.
      var occ = occupied.slice(), fits = [], viol = false, seats = 0, count = 0;
      for (var i = 0; i < opt.length; i++) {
        var gs = groupsFor(opt[i]);
        if (!gs.offered || !gs.groups.length) return null;
        var ok = gs.groups.filter(function (g) { return !unitConflicts(g.rep, occ); })
          .sort(function (a, b) { return a.viol.length - b.viol.length || unitCost(a.rep, prefs, true) - unitCost(b.rep, prefs, true); });
        if (!ok.length) return null;
        fits.push(ok[0]);
        ok[0].meetings.forEach(function (m) { occ.push(m); });
        if (ok[0].viol.length) viol = true;
        seats += ok.reduce(function (t, g) { return t + g.seats; }, 0);
        count += ok.reduce(function (t, g) { return t + g.units.length; }, 0);
      }
      var code = opt[0];
      var both = [];
      opt.forEach(function (c) {
        if (ctx.needGK && ctx.gkSet[c] && both.indexOf('Global Knowledge') === -1) both.push('Global Knowledge');
        if (ctx.needAD && ctx.adSet[c] && both.indexOf('American Democracy') === -1) both.push('American Democracy');
      });
      var info = (index.courses[code] || {}).info || {};
      return { option: opt, code: opt.join(' + '), title: info.lt || info.t || '', groupsFit: fits, sectionsFit: count, seats: seats, viol: viol, alsoCounts: both, prereq: opt.map(function (c) { return prereqFlag((index.courses[c] || {}).info, ctx.taken); }).filter(Boolean).join(' '), online: fits.every(function (g) { return g.rep.onlineAny; }) };
    }
    function rankCandidates(list) {
      return list.sort(function (a, b) {
        return ((isPoole(a.option[0]) ? 1 : 0) - (isPoole(b.option[0]) ? 1 : 0)) || (b.alsoCounts.length - a.alsoCounts.length) || ((a.prereq ? 1 : 0) - (b.prereq ? 1 : 0)) ||
          ((a.viol ? 1 : 0) - (b.viol ? 1 : 0)) || (b.sectionsFit - a.sectionsFit) || (a.code < b.code ? -1 : 1);
      });
    }
    function searchFitting(p, o, query, limit) {
      var q = String(query || '').trim().toUpperCase();
      if (q.length < 2) return [];
      var oc = occupiedExcept(p, null, o), out = [];
      var codes = Object.keys(index.courses).sort();
      for (var i = 0; i < codes.length && out.length < (limit || 40); i++) {
        var code = codes[i], info = index.courses[code].info || {};
        if ((code + ' ' + (info.lt || '') + ' ' + (info.t || '')).toUpperCase().indexOf(q) === -1) continue;
        if (ctx.allCodes[code] || oc.used[code]) continue;
        var c = candidateFor([code], oc.occ);
        if (c) out.push(c);
      }
      return rankCandidates(out);
    }
    function sectionsOf(code) { return groupsFor(code); }

    // ---------- Pull ahead ----------
    // If every section of a course fills, which core courses from LATER semesters of the
    // student's plan could they take this term instead? A course qualifies when it is offered,
    // has an eligible section that fits the rest of the schedule, and its prerequisites are
    // already done or in progress (Paw Plan's own rules plus the catalog text).
    var PREREQ_ALT = { 'ARE 201': ['ARE 201', 'EC 201', 'EC 205'], 'EC/ARE 301': ['EC 301', 'ARE 301'], 'MA 121/131/141': ['MA 121', 'MA 131', 'MA 141'] };
    function labelCodes(label) {
      if (PREREQ_ALT[label]) return PREREQ_ALT[label];
      var sl = expandSlashCode(label);
      if (sl) return sl.map(function (o) { return o[0]; });
      return String(label).split(/,|\bor\b/).map(function (x) { return x.trim(); }).filter(function (x) { return CODE_RE.test(x); });
    }
    function paw_prereqs_ok(label) {
      var reqs = (lists.PREREQS || {})[label] || [];
      return reqs.every(function (r) { return labelCodes(r).some(function (c) { return ctx.taken[c]; }); });
    }
    var laterPool = null;
    function buildLaterPool() {
      var target = termRank(index.term), pool = [], seen = {};
      plan.forEach(function (sem) {
        var r = termRank(sem.term);
        if (r === null || target === null || r <= target) return;
        sem.courses.forEach(function (c) {
          var label = String(c.code || '').trim();
          if (!label || label === 'ARE 490' || c.id === 'ARE490') return; // ARE 490 stays near the end
          var opts = null;
          if (c.transferPlan) return;
          if (optionFromLabel(label)) opts = [optionFromLabel(label)];
          else if (expandSlashCode(label) && !c.picker) opts = expandSlashCode(label);
          else if (c.picker && lists.SLASH_COURSES[c.picker] && !OPEN_PICKERS[c.picker] && lists.SLASH_COURSES[c.picker].length <= CHOICE_MAX)
            opts = lists.SLASH_COURSES[c.picker].map(function (o) { return optionFromLabel(o.c); }).filter(Boolean);
          if (!opts) return;
          opts = withSubs(opts, index.subs);
          if (opts.some(function (o) { return o.every(function (x) { return ctx.taken[x]; }); })) return; // already met
          opts = preferARE(opts, function (x) { return !!index.courses[x] && groupsFor(x).groups.length > 0; });
          var prereqOk = paw_prereqs_ok(label);
          opts.forEach(function (opt) {
            if (opt.length !== 1) return;
            var code = opt[0];
            if (seen[code] || ctx.taken[code]) return;
            seen[code] = 1;
            var info = (index.courses[code] || {}).info;
            if (!index.courses[code] || !prereqOk || prereqFlag(info, ctx.taken)) return;
            pool.push({ code: code, label: label, fromTerm: sem.term, units: c.units || 3, cat: c.cat || 'dept' });
          });
        });
      });
      return pool;
    }
    function pullAhead(p, it) {
      if (!laterPool) laterPool = buildLaterPool();
      var oc = occupiedExcept(p, it, null), out = [], perLabel = {};
      laterPool.forEach(function (c) {
        if (oc.used[c.code] || perLabel[c.label]) return; // first listed option that fits, one per requirement
        var gs = groupsFor(c.code);
        if (!gs.offered) return;
        var fit = gs.groups.filter(function (g) { return !unitConflicts(g.rep, oc.occ); })
          .sort(function (a, b) { return a.viol.length - b.viol.length || unitCost(a.rep, prefs, true) - unitCost(b.rep, prefs, true); });
        if (!fit.length) return;
        var n = fit.reduce(function (t, g) { return t + g.units.length; }, 0);
        perLabel[c.label] = 1;
        out.push({ code: c.code, label: c.label, fromTerm: c.fromTerm, units: c.units, cat: c.cat, group: fit[0], sectionsFit: n, title: ((index.courses[c.code] || {}).info || {}).lt || '' });
      });
      // Department core first, then the soonest planned term, then the most sections that fit.
      return out.sort(function (a, b) { return ((a.cat === 'dept' ? 0 : 1) - (b.cat === 'dept' ? 0 : 1)) || termRank(a.fromTerm) - termRank(b.fromTerm) || b.sectionsFit - a.sectionsFit; });
    }

    // "No schedule meets every preference" only when a chosen section actually breaks one.
    plans.forEach(function (p) { p.relaxed = p.items.some(function (it) { return it.group && it.group.viol && it.group.viol.length; }); });
    relaxed = plans.length ? plans[0].relaxed : relaxed;
    return { ok: true, term: index.term, ctx: ctx, slots: slots, plans: plans, notes: notes, relaxed: relaxed, openSlots: open,
      refresh: refresh, search: searchFitting, sectionsOf: sectionsOf, pullAhead: pullAhead };
  }

  // ---------- Toolkit for the audit view ----------
  // Per-requirement choices: which spring courses fill a plan slot, which sections fit around
  // the student's other picks, and why the rest are unavailable (not offered, prerequisites,
  // restrictions, time conflicts). Uses the same rules as buildSchedules.
  var PREREQ_ALT_TK = { 'ARE 201': ['ARE 201', 'EC 201', 'EC 205'], 'EC/ARE 301': ['EC 301', 'ARE 301'], 'MA 121/131/141': ['MA 121', 'MA 131', 'MA 141'] };
  function toolkit(index, plan, lists, prefs, input) {
    prefs = prefs || {};
    var opts = { includeConsent: !!prefs.includeConsent };
    var ctx = buildContext(index, plan, lists, input);
    var busy = (prefs.busy || []).map(function (b) { return { days: b.days, start: b.start, end: b.end, d0: 0, d1: 0, busy: true }; });
    var cache = {};
    function groupsFor(code) { if (!cache[code]) cache[code] = courseGroups(index, code, ctx, prefs, busy, opts); return cache[code]; }
    function labelCodes(label) {
      if (PREREQ_ALT_TK[label]) return PREREQ_ALT_TK[label];
      var sl = expandSlashCode(label);
      if (sl) return sl.map(function (o) { return o[0]; });
      return String(label).split(/,|\bor\b/).map(function (x) { return x.trim(); }).filter(function (x) { return CODE_RE.test(x); });
    }
    // Paw Plan's own prerequisite rules (PREREQS) are firm, except those it marks as soft
    // preferences (SOFT_PREREQS), which only raise a note. Catalog text only raises a flag.
    function prereqGaps(label, code) {
      var hard = [], soft = [];
      [label, code].forEach(function (k) {
        var softList = (lists.SOFT_PREREQS || {})[k] || [];
        ((lists.PREREQS || {})[k] || []).forEach(function (r) {
          if (labelCodes(r).some(function (c) { return ctx.taken[c]; })) return;
          var bucket = softList.indexOf(r) !== -1 ? soft : hard;
          if (bucket.indexOf(r) === -1) bucket.push(r);
        });
      });
      return { hard: hard, soft: soft };
    }
    function lockReason(label, code) {
      var g = prereqGaps(label, code);
      return g.hard.length ? 'Needs ' + g.hard.join(' and ') + ' first' : '';
    }
    function slotOf(c) {
      var probe = { code: c.schedOrigCode || c.code, picker: c.picker, units: c.units, cat: c.cat, name: c.name, tag: c.tag, transferPlan: c.transferPlan };
      return classifySlots({ courses: [probe] }, 0, lists, index.subs)[0];
    }
    function unitKey(u) { return u.sections.map(function (x) { return x.nbr; }).join('+'); }
    function findUnit(code, key) {
      var c = index.courses[code];
      if (!c) return null;
      for (var i = 0; i < c.units.length; i++) if (unitKey(c.units[i]) === key) return c.units[i];
      return null;
    }
    // All choices for one plan slot. occupied: meetings of the student's other picks (+ busy).
    function choices(c, occupied, used) {
      var slot = slotOf(c), out = { slot: slot, fits: [], noFit: [], locked: [], notOffered: [], free: !!slot.isFree, note: slot.kind === 'note' };
      if (slot.kind === 'note' || slot.isFree) return out;
      var options = slot.kind === 'open' ? slot.pool.options : slot.options;
      if (slot.kind !== 'open') options = preferARE(options, function (x) { return !!index.courses[x] && groupsFor(x).groups.length > 0 && !lockReason(slot.label, x); });
      var occ = busy.concat(occupied || []);
      options.forEach(function (opt) {
        var code = opt.join(' + ');
        if (opt.some(function (x) { return (used && used[x]) || (ctx.taken[x]); })) return;
        var info = (index.courses[opt[0]] || {}).info || {};
        var entry = { option: opt, code: code, title: info.lt || info.t || '', alsoCounts: [], warn: '' };
        opt.forEach(function (x) {
          if (ctx.needGK && ctx.gkSet[x] && entry.alsoCounts.indexOf('Global Knowledge') === -1) entry.alsoCounts.push('Global Knowledge');
          if (ctx.needAD && ctx.adSet[x] && entry.alsoCounts.indexOf('American Democracy') === -1) entry.alsoCounts.push('American Democracy');
        });
        var lock = lockReason(slot.label, opt[0]);
        if (lock) { entry.why = lock; out.locked.push(entry); return; }
        var notOff = opt.filter(function (x) { return !index.courses[x]; });
        if (notOff.length) { entry.why = notOff.join(', ') + ' is not offered in ' + index.term; out.notOffered.push(entry); return; }
        var noElig = opt.filter(function (x) { return !groupsFor(x).groups.length; });
        if (noElig.length) { entry.why = 'No open section you can take (' + Object.keys(groupsFor(noElig[0]).excluded).join('; ') + ')'; out.notOffered.push(entry); return; }
        var softGap = prereqGaps(slot.label, opt[0]).soft;
        var catFlags = opt.map(function (x) { return prereqFlag((index.courses[x] || {}).info, ctx.taken); }).filter(Boolean);
        entry.warn = catFlags.concat(softGap.length ? ['Paw Plan suggests ' + softGap.join(' and ') + ' first'] : []).join(' ');
        // Missing catalog prerequisite ranks below a soft Paw Plan preference.
        entry.warnLevel = catFlags.length ? 2 : softGap.length ? 1 : 0;
        // Time options: for a single course, every fitting time group; for a bundle (course + lab
        // course), the first fitting combination.
        var o2 = occ.slice(), times = [];
        if (opt.length === 1) {
          times = groupsFor(opt[0]).groups.filter(function (g) { return !unitConflicts(g.rep, o2); })
            .sort(function (a, b) { return a.viol.length - b.viol.length || unitCost(a.rep, prefs, true) - unitCost(b.rep, prefs, true); })
            .map(function (g) { return { groups: [g], units: [g.rep], viol: g.viol, count: g.units.length }; });
        } else {
          var gsel = [];
          for (var i = 0; i < opt.length; i++) {
            var g = groupsFor(opt[i]).groups.filter(function (x) { return !unitConflicts(x.rep, o2); })[0];
            if (!g) { gsel = null; break; }
            gsel.push(g); o2 = o2.concat(g.meetings);
          }
          if (gsel) times = [{ groups: gsel, units: gsel.map(function (x) { return x.rep; }), viol: [].concat.apply([], gsel.map(function (x) { return x.viol; })), count: 1 }];
        }
        entry.times = times;
        entry.sectionsFit = times.reduce(function (t, x) { return t + x.count; }, 0);
        if (times.length) out.fits.push(entry);
        else {
          // Name what is in the way: the other picks (by course) or the student's busy times.
          var blockers = {}, busyHit = false;
          opt.forEach(function (x) {
            groupsFor(x).groups.forEach(function (g) {
              g.meetings.forEach(function (m) { occ.forEach(function (o) { if (meetConflict(m, o)) { if (o.busy) busyHit = true; else if (o.code) blockers[o.code] = 1; } }); });
            });
          });
          var names = Object.keys(blockers);
          entry.blockers = names;
          entry.why = 'Every section conflicts with ' + (names.length ? names.join(', ') : '') + (names.length && busyHit ? ' or ' : '') + (busyHit ? 'your busy times' : '') + (names.length ? '. Change that pick to free up a time.' : '.');
          out.noFit.push(entry);
        }
      });
      out.fits.sort(function (a, b) {
        return ((a.warnLevel || 0) - (b.warnLevel || 0)) || ((isARE(b.option[0]) ? 1 : 0) - (isARE(a.option[0]) ? 1 : 0)) || ((isPoole(a.option[0]) ? 1 : 0) - (isPoole(b.option[0]) ? 1 : 0)) || (b.alsoCounts.length - a.alsoCounts.length) ||
          ((a.times[0].viol.length ? 1 : 0) - (b.times[0].viol.length ? 1 : 0)) || (b.sectionsFit - a.sectionsFit) || (a.code < b.code ? -1 : 1);
      });
      return out;
    }
    // A requirement already met by a course on record (for example ARE 255 for AEE 226).
    function satisfiedBy(c) {
      var sl = slotOf(c);
      if (sl.kind !== 'fixed' && sl.kind !== 'choice') return '';
      for (var i = 0; i < sl.options.length; i++) if (sl.options[i].every(function (x) { return ctx.taken[x]; })) return sl.options[i].join(' + ');
      return '';
    }
    function backups(code, unit, occupied) {
      var occ = busy.concat(occupied || []), out = [];
      groupsFor(code).groups.forEach(function (g) {
        var same = g.units.some(function (u) { return u === unit; }) || g.timeKey === unit.timeKey;
        if (!same && unitConflicts(g.rep, occ)) return;
        g.units.forEach(function (u) { if (unitKey(u) !== unitKey(unit)) out.push({ unit: u, same: same, viol: g.viol }); });
      });
      return out.sort(function (a, b) { return (b.same ? 1 : 0) - (a.same ? 1 : 0) || a.viol.length - b.viol.length || b.unit.avail - a.unit.avail; });
    }
    function search(query, occupied, used, limit) {
      var q = String(query || '').trim().toUpperCase(), out = [];
      if (q.length < 2) return out;
      var occ = busy.concat(occupied || []);
      Object.keys(index.courses).sort().forEach(function (code) {
        if (out.length >= (limit || 30)) return;
        var info = index.courses[code].info || {};
        if ((code + ' ' + (info.lt || '') + ' ' + (info.t || '')).toUpperCase().indexOf(q) === -1) return;
        if (ctx.taken[code] || (used && used[code])) return;
        var times = groupsFor(code).groups.filter(function (g) { return !unitConflicts(g.rep, occ); })
          .map(function (g) { return { groups: [g], units: [g.rep], viol: g.viol, count: g.units.length }; });
        if (!times.length) return;
        out.push({ option: [code], code: code, title: info.lt || info.t || '', times: times, sectionsFit: times.reduce(function (t, x) { return t + x.count; }, 0), alsoCounts: [], warn: prereqFlag(info, ctx.taken) });
      });
      return out;
    }
    return { ctx: ctx, slotOf: slotOf, choices: choices, satisfiedBy: satisfiedBy, subs: index.subs || {}, backups: backups, search: search, findUnit: findUnit, unitKey: unitKey, groupsFor: groupsFor, lockReason: lockReason, termRank: termRank };
  }

  function courseDiff(A, B) {
    var a = A.items.map(function (i) { return i.code; }), b = B.items.map(function (i) { return i.code; });
    return { added: b.filter(function (c) { return a.indexOf(c) === -1; }), removed: a.filter(function (c) { return b.indexOf(c) === -1; }) };
  }

  var api = {
    prepare: prepare, buildSchedules: buildSchedules, isPoole: isPoole, toolkit: toolkit, termRank: termRank, unitConflicts: unitConflicts, fmtTime: fmtTime, DAY_NAMES: DAY_NAMES,
    checkRestriction: checkRestriction, parseDays: parseDays, VIOLATION_TEXT: VIOLATION_TEXT,
    standingFromCredits: standingFromCredits
  };
  root.PawSchedEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

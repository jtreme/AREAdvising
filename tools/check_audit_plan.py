#!/usr/bin/env python3
"""Check that Paw Plan's plan asks for exactly what the degree audit says is still needed.

Usage:
    python3 tools/check_audit_plan.py AUDIT.txt PLAN.json [--term "Spring 2027"]

AUDIT.txt  text of the audit PDF (pdftotext -layout audit.pdf AUDIT.txt)
PLAN.json  the plan Paw Plan built from that same PDF (tools/dump_plan.js writes it)

For every unmet line on the audit (a requirement with units but no class, term or grade),
the plan's future slots for that requirement must add up to the same units. Future slots
that match no unmet line are reported too (a requirement the audit does not ask for).
Exit status 1 when anything does not match.

This reads the audit text on its own, without Paw Plan's parser, so the two can check
each other.
"""
import json
import re
import sys

# Audit requirement description -> the plan slot codes that fill it.
# Order matters: the first pattern that matches a line wins.
REQS = [
    (r"^COM 110\b|Public Speaking", ["COM 110"]),
    (r"COM 112", ["COM 112/211/226 or ENG 332"]),
    (r"AEE 226", ["AEE 226"]),
    (r"MA 121, 131 or 141", ["MA 121/131/141"]),
    (r"MA 114, 231 or 241", ["MA 114, 231 or 241", "MA 114"]),
    (r"^Statistics\b|ST 311", ["ST 311, BUS 350 or ST 350"]),
    (r"BIO ?105", ["BIO 105/106/181 or PB 200"]),
    (r"Natural Science Elective", ["Natural Science Elective (3 cr)", "Natural Science Elective (4 cr)",
                                   "Natural Science Elective", "Natural Science Credit Remaining"]),
    (r"EC 202|Princ of Macroecon", ["EC 202"]),
    (r"ACC 200 or ACC 210", ["ACC 210"]),
    (r"ARE 303 or ARE 304", ["ARE 303/304"]),
    (r"ARE 306 or ARE 309", ["ARE 306/309"]),
    (r"ARE 311 or ARE 312", ["ARE 311/312"]),
    (r"ARE 321", ["ARE 321/323/BUS 320"]),
    (r"ARE 301 or EC 301", ["EC/ARE 301"]),
    (r"ARE 433|U S Agric Policy", ["ARE 433"]),
    (r"ARE 490|Career Sem", ["ARE 490"]),
    (r"ARE 336|Resource Envi Econ", ["ARE 336"]),
    (r"ARE 400-level Electives", ["ARE 4XX"]),
    (r"^ARE Elective", ["ARE Elective (ARE 3XX or ARE 4XX)"]),
    (r"^Technical Electives", ["Technical Elective"]),
    (r"Departmental or Technical Elec", ["Dept or Technical Elective"]),
    (r"Humanities Elective", ["GEP Humanities", "GEP Humanities 2"]),
    (r"Social Science", ["Social Science Elective"]),
    (r"HES Fitness & Wellness", ["HESF 1XX"]),
    (r"HES Fit Elective", ["HES 100/200"]),
    (r"Interdisc Perspectives", ["Interdisc Perspectives"]),
    (r"GEP Elective", ["GEP Elective"]),
    (r"Free Elective", ["Free Elective"]),
    (r"ALS 103|Orientation", ["ALS 103/303 or ARE 290", "ALS 103"]),
]

TERM_RE = re.compile(r"(Fall|Spring|Sum[12]?|Summer) '\d{2}")
UNMET_RE = re.compile(r"^\s*(?:\d{1,3}\s+)?(?P<desc>.*?)\s+(?P<units>\d+\.\d{3})\s+(?:Rqmnt Details\s+)?(?:Waive|Add To Planner|Details)\s*$")
TERMS = {"Spring": 0, "Summer": 1, "Fall": 2}


def term_rank(t):
    m = re.match(r"^(Spring|Summer|Fall) (\d{4})$", t or "")
    return int(m.group(2)) * 3 + TERMS[m.group(1)] if m else None


def unmet_lines(text):
    out, prev = [], ""
    for raw in text.splitlines():
        line = re.sub(r"[\ue000-\uf8ff\u200b]", "", raw).rstrip()  # icon glyphs from the PDF
        if not line.strip():
            continue
        m = UNMET_RE.match(line)
        if m and not TERM_RE.search(line):
            desc = re.sub(r"\s{2,}", " ", m.group("desc")).strip()
            if not desc:  # wrapped line: the description sits on the line above
                desc = re.sub(r"\s{2,}", " ", prev).strip()
            out.append((desc, float(m.group("units"))))
        prev = line
    return out


def main():
    args = sys.argv[1:]
    term = "Spring 2027"
    if "--term" in args:
        i = args.index("--term")
        term = args[i + 1]
        del args[i:i + 2]
    audit_path, plan_path = args
    text = open(audit_path, encoding="utf-8", errors="replace").read()
    plan = json.load(open(plan_path))
    tr = term_rank(term)

    # Future slots: regular and summer terms from the planning term on.
    slots = []
    for sem in plan:
        r = term_rank(sem["term"])
        if r is None or r < tr:
            continue
        for c in sem["courses"]:
            if c.get("schedExtra") or c.get("transferPlan"):
                continue
            slots.append({"code": c.get("schedOrigCode") or c["code"], "units": float(c.get("units") or 0), "term": sem["term"], "used": False})

    problems, rows = [], []
    for desc, units in unmet_lines(text):
        codes = next((codes for pat, codes in REQS if re.search(pat, desc)), None)
        if codes is None:
            problems.append(f"Audit line not recognized by this check: '{desc}' {units:g} cr (add it to REQS)")
            continue
        mine = [s for s in slots if not s["used"] and s["code"] in codes]
        got = sum(s["units"] for s in mine)
        for s in mine:
            s["used"] = True
        ok = abs(got - units) < 0.01
        rows.append((ok, desc, units, got))
        if not ok:
            problems.append(f"{desc}: audit needs {units:g} cr, plan has {got:g} cr")
    for s in slots:
        if not s["used"]:
            problems.append(f"Plan has {s['code']} ({s['units']:g} cr, {s['term']}) but no unmet audit line asks for it")

    for ok, desc, units, got in rows:
        print(f"  {'ok ' if ok else 'BAD'}  {desc}: audit {units:g}, plan {got:g}")
    if problems:
        print("MISMATCHES:")
        for p in problems:
            print("  - " + p)
        sys.exit(1)
    print("Plan matches the audit.")


if __name__ == "__main__":
    main()

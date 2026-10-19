#!/usr/bin/env python3
"""Convert a class schedule workbook pulled from NC State's public course catalog
(https://webappprd.acs.ncsu.edu/php/coursecat/) into the schedule builder's data file.

Usage:
    python3 tools/build_coursecat_xlsx.py "Summer 2027" path/to/NC_State_Summer_2027_Classes.xlsx [--as-of 2026-10-19]

The workbook has sheets "Classes", "Courses" and "Section details" (header on row 6), as in the
Summer 2027 export. Writes scheduler/data/<term-slug>.json and adds the term to terms.json, in the
same format tools/build_schedule_data.py writes for the Schedule of Classes CSV.

Differences from the CSV: the public catalog gives no Assoc Class numbers, so a lecture is paired
with labs from the same summer session; most summer sections have no set meeting time ("TBD").
"""
import datetime
import json
import os
import re
import sys

import openpyxl

KEEP_COMPONENTS = {"Lec": "LEC", "Lab": "LAB", "Sem": "SEM", "Phy": "ACT", "Pro": "PRB", "Fie": "FLD"}
SESSION = {
    ("Summer I", "Summer Five Week Session"): "S1",
    ("Summer I", "Summer Ten Week Session"): "S10",
    ("Summer II", "Summer Five Week Session"): "S2",
    ("Summer I", "Maymester Three Week Session"): "MAY",
    ("Summer II", "Maymester Three Week Session"): "MAY",
}
DAY = {"Mo": "M", "Tu": "T", "We": "W", "Th": "Th", "Fr": "F", "Sa": "S", "Su": "Su"}


def rows(ws):
    data = list(ws.iter_rows(values_only=True))
    hi = next(i for i, r in enumerate(data[:10]) if r and r[0] == "Term")
    head = data[hi]
    return [dict(zip(head, r)) for r in data[hi + 1:] if r and any(v is not None for v in r)]


def minutes(t):
    m = re.match(r"^(\d{1,2}):(\d{2})\s*([AP]M)$", (t or "").strip())
    if not m:
        return -1
    h, mi = int(m.group(1)) % 12, int(m.group(2))
    return (h + (12 if m.group(3) == "PM" else 0)) * 60 + mi


def meeting(text):
    """'Mo We Fr 9:50 AM - 11:20 AM' (first timed line) -> ('MWF', 590, 680). TBD -> ('', -1, -1)."""
    for line in str(text or "").splitlines():
        m = re.match(r"^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s+(?:Mo|Tu|We|Th|Fr|Sa|Su))*)\s+(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)", line.strip())
        if m:
            return "".join(DAY[d] for d in m.group(1).split()), minutes(m.group(2)), minutes(m.group(3))
    return "", -1, -1


def doy(d):
    return d.timetuple().tm_yday if isinstance(d, datetime.datetime) else 0


def main():
    args = sys.argv[1:]
    as_of = datetime.date.today().isoformat()
    if "--as-of" in args:
        i = args.index("--as-of")
        as_of = args[i + 1]
        del args[i:i + 2]
    if len(args) != 2:
        sys.exit(__doc__)
    term, src = args
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    classes, courses_rows, details = rows(wb["Classes"]), rows(wb["Courses"]), rows(wb["Section details"])
    det = {(d["Term"], str(d["Class number"])): d for d in details}
    info = {}
    for c in courses_rows:
        info.setdefault(c["Course"], {"t": c["Course title"] or "", "lt": c["Course title"] or "",
                                      "req": (c.get("Prerequisites / course requirements") or "").strip()})
    courses, sections = {}, []
    for r in classes:
        code = (r["Course"] or "").strip()
        num = re.match(r"^[A-Z]+ (\d{3})", code)
        if not num or int(num.group(1)) >= 500 or r["Component"] not in KEEP_COMPONENTS:
            continue
        status = {"Open": 0, "Reserved": 0, "Closed": 1}.get(r["Availability"], 0)
        days, start, end = meeting(r["Days / times"])
        loc = r["Location"] or ""
        online = "Online" in loc or (r["Distance education note"] == "Yes" and not days)
        mode = "PH" if "Hybrid" in loc else ("OS" if online and days else "OA" if online else "P")
        d = det.get((r["Term"], str(r["Class number"])), {})
        req = (d.get("Enrollment requisites") or "").strip()
        consent = 1 if "Instructor Approval" in req else 2 if "Departmental Approval" in req else 0
        restrict = "; ".join(x.strip() for x in req.splitlines() if x.strip() and "Approval Required" not in x)
        lo, hi = r["Credits min"], r["Credits max"]
        units = str(lo) if lo == hi else "%s-%s" % (lo, hi)
        session = SESSION.get((r["Term"], r["Session"]), "S1" if r["Term"] == "Summer I" else "S2")
        courses.setdefault(code, info.get(code, {"t": r["Course title"] or "", "lt": r["Course title"] or "", "req": ""}))
        sections.append([
            code, str(r["Section"]), int(r["Class number"]), KEEP_COMPONENTS[r["Component"]],
            session,  # assoc: no Assoc Class in the public catalog, so pair within the session
            days, start, end, mode, session, units, status,
            int(r["Capacity"] or 0), int(r["Seats available"] or 0), restrict, consent,
            str(r["Instructor"] or "").split(",")[0].strip(), doy(r["Start date"]), doy(r["End date"]),
            "" if online else loc, "DE" if online else "NCSU1", (r["Topic"] or "").strip(),
        ])
    slug = re.sub(r"[^a-z0-9]+", "-", term.lower()).strip("-")
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scheduler", "data")
    payload = {
        "term": term, "termCode": "", "source": os.path.basename(src),
        "built": datetime.date.today().isoformat(), "asOf": as_of,
        "fields": ["code", "sec", "nbr", "comp", "assoc", "days", "start", "end", "mode", "session",
                   "units", "status", "cap", "avail", "restrict", "consent", "instructor",
                   "startDay", "endDay", "room", "campus", "topic"],
        "courses": courses, "sections": sections,
    }
    out = os.path.join(out_dir, slug + ".json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"), ensure_ascii=False)
    mp = os.path.join(out_dir, "terms.json")
    manifest = json.load(open(mp)) if os.path.exists(mp) else {"terms": []}
    manifest["terms"] = [t for t in manifest["terms"] if t["term"] != term]
    manifest["terms"].append({"term": term, "file": "data/" + slug + ".json", "built": payload["built"], "asOf": as_of, "source": payload["source"]})
    order = {"Spring": 0, "Summer": 1, "Fall": 2}
    manifest["terms"].sort(key=lambda t: (t["term"].split()[-1], order.get(t["term"].split()[0], 3)))
    json.dump(manifest, open(mp, "w"), indent=1)
    print(f"{term}: {len(sections)} sections, {len(courses)} courses -> {os.path.relpath(out)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Convert an NC State "Schedule of Classes" CSV export into the compact data file
the Paw Plan schedule builder reads.

Usage:
    python3 tools/build_schedule_data.py "Spring 2027" path/to/Spring_2027_Schedule_of_Classes.csv [--as-of 2026-10-13]

--as-of is the date the CSV was downloaded (students see "Sections as of <date>"). Default: today.

Writes scheduler/data/<term-slug>.json and adds the term to scheduler/data/terms.json.
Only undergraduate (100-499), non-cancelled, schedulable sections are kept.
"""
import csv
import datetime
import json
import os
import re
import sys

# Components that are individually arranged (research, thesis, internship, etc.) are
# not something a student schedules around, so they are left out.
SKIP_COMPONENTS = {"IND", "RSC", "THE", "INT", "CLN", "ADM", "TEA", "PRA"}
SKIP_LOCATIONS = {"VETMED"}
SKIP_MODES = set()  # study abroad (SA) sections are kept; the builder shows them only as explicit choices
# Department rule: a tentative section is not offered. Cancelled and tentative sections are dropped.
STATUS_CODE = {"Active": 0, "Stop Further Enrollment": 3}  # 1 = closed (set below)


def minutes(t):
    """'08:30AM' -> 510. Blank or TBA -> -1."""
    m = re.match(r"^(\d{1,2}):(\d{2})\s*([AP]M)$", (t or "").strip())
    if not m:
        return -1
    h, mi, ap = int(m.group(1)), int(m.group(2)), m.group(3)
    if h == 12:
        h = 0
    if ap == "PM":
        h += 12
    return h * 60 + mi


def day_of_year(d):
    try:
        return datetime.datetime.strptime(d.strip(), "%m/%d/%Y").timetuple().tm_yday
    except ValueError:
        return 0


def as_int(v):
    try:
        return int(str(v).strip())
    except ValueError:
        return 0


def main():
    args = sys.argv[1:]
    as_of = datetime.date.today().isoformat()
    if "--as-of" in args:
        i = args.index("--as-of")
        as_of = args[i + 1]
        datetime.date.fromisoformat(as_of)
        del args[i:i + 2]
    if len(args) != 2:
        sys.exit(__doc__)
    term, src = args
    with open(src, encoding="utf-8-sig", errors="replace", newline="") as f:
        rows = list(csv.reader(f))
    # The export has a title row ("Class Schedule", count) before the real header.
    hi = next(i for i, r in enumerate(rows[:5]) if "Subject" in r and "Catalog Nbr" in r)
    header = rows[hi]
    recs = [dict(zip(header, r)) for r in rows[hi + 1:] if len(r) >= len(header) - 1]

    courses, sections = {}, []
    for r in recs:
        status = STATUS_CODE.get(r["Class Status"].strip())
        if status is None:
            continue  # cancelled or tentative
        num = re.match(r"^(\d{3})", r["Catalog Nbr"].strip())
        if not num or int(num.group(1)) >= 500:
            continue
        if r["Component"] in SKIP_COMPONENTS or r["Location"] in SKIP_LOCATIONS or r["Instruction Mode"] in SKIP_MODES:
            continue
        code = r["Subject"].strip() + " " + r["Catalog Nbr"].strip()
        if r["Enrollment Status"].strip() == "Closed":
            status = 1  # closed to enrollment, whatever the section status
        if code not in courses:
            courses[code] = {
                "t": r["Class Description"].strip(),
                "lt": r["Long Title"].strip(),
                "req": r["Course Requirement Description"].strip(),
            }
        consent = {"Instructor Consent Required": 1, "Department Consent Required": 2}.get(r["Consent"].strip(), 0)
        days = r["Meeting Days"].strip()
        sections.append([
            code,
            r["Class Section"].strip(),
            as_int(r["Class Nbr"]),
            r["Component"].strip(),
            r["Assoc Class"].strip(),
            "" if days == "TBA" else days,
            minutes(r["Meeting Start Time"]),
            minutes(r["Meeting End Time"]),
            r["Instruction Mode"].strip(),
            r["Session"].strip(),
            r["Units"].strip(),
            status,
            as_int(r["Enrollment Capacity"]),
            as_int(r["Enroll Avail"]),
            r["Class Requirement Description"].strip(),
            consent,
            r["Instructor Name 1"].split(",")[0].strip(),
            day_of_year(r["Start Date"]),
            day_of_year(r["End Date"]),
            r["Room Descr"].strip(),
            r["Location"].strip(),
            (r["Topic Dscr Frml"] or "").strip(),
        ])

    slug = re.sub(r"[^a-z0-9]+", "-", term.lower()).strip("-")
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(here, "..", "scheduler", "data")
    os.makedirs(out_dir, exist_ok=True)
    payload = {
        "term": term,
        "termCode": recs[0].get("Term", "") if recs else "",
        "source": os.path.basename(src),
        "built": datetime.date.today().isoformat(),
        "asOf": as_of,
        "fields": ["code", "sec", "nbr", "comp", "assoc", "days", "start", "end", "mode", "session",
                   "units", "status", "cap", "avail", "restrict", "consent", "instructor",
                   "startDay", "endDay", "room", "campus", "topic"],
        "courses": courses,
        "sections": sections,
    }
    out = os.path.join(out_dir, slug + ".json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"), ensure_ascii=False)

    manifest_path = os.path.join(out_dir, "terms.json")
    try:
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
    except (OSError, ValueError):
        manifest = {"terms": []}
    manifest["terms"] = [t for t in manifest["terms"] if t["term"] != term]
    manifest["terms"].append({"term": term, "file": "data/" + slug + ".json", "built": payload["built"], "asOf": as_of, "source": payload["source"]})
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1)
    print(f"{term}: {len(sections)} sections, {len(courses)} courses -> {os.path.relpath(out)} ({os.path.getsize(out)//1024} KB)")


if __name__ == "__main__":
    main()

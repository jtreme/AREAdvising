# Paw Plan schedule builder (beta)

Builds conflict-free section schedules (Plan A, B, C) for the semester in a student's Paw Plan,
with backup sections, open-requirement choices, and MyPack class numbers.

Hidden until approved: it only loads at `index.html?scheduler=1`.

## Files

- `engine.js`: scheduling logic, no page code. Pass 1 schedules required courses and short
  either/or choices; pass 2 lists courses that fit the gaps for Humanities, electives, etc.
- `scheduler.js`: the screen. Reads the plan through `window.PawPlanBridge` in `index.html`.
- `data/terms.json`: list of available terms. `data/<term>.json`: that term's sections.

## Each new semester

1. Download the Schedule of Classes CSV for the term.
2. Run:

   ```
   python3 tools/build_schedule_data.py "Fall 2027" path/to/Fall_2027_Schedule_of_Classes.csv
   ```

3. Commit the new `scheduler/data/` files. The builder uses whichever listed term matches a
   semester in the student's plan.

Re-running with a fresh CSV for the same term refreshes seat counts and section changes.

## Department corrections

`data/overrides.json` lists courses the department knows will not run, even when the Schedule
of Classes shows an active section. Add the course code under the term's
`notOffered` list and commit; no rebuild is needed.

## What it checks

- Time conflicts, including 8-week sessions and the student's busy times.
- Lecture + lab / recitation / problem session pairing (sections sharing an Assoc Class number).
- Closed, honors, cancelled, tentative, and consent-required sections are left out. A tentative
  section is treated as not offered.
- Section restrictions it can read (class standing, ABM-only, GPA from the audit). Sections with
  restrictions it cannot verify, such as other majors only, are left out.
- Prerequisites are flagged from catalog text, never enforced.

# Paw Plan schedule builder (beta)

Builds conflict-free section schedules (Plan A, B, C) for the semester in a student's Paw Plan,
with backup sections, open-requirement choices, and MyPack class numbers.

Hidden until approved: it only loads at `index.html?scheduler=1` (students) or
`index.html?advisor=1` (advisors).

After an audit upload, the first screen is the **audit view**: the degree audit with every
remaining requirement as a red X and a "Choose for <term>" button. Picking a course and a time
writes it into the plan's term (moving it from a later semester if needed); Remove puts it back,
and "Not this term" moves a suggested course to the next term with room. The full builder
(Plans A/B/C, preferences, advising check) opens from there and keeps every picked section.

## Files

- `engine.js`: scheduling logic, no page code. Pass 1 schedules required courses and short
  either/or choices; pass 2 lists courses that fit the gaps for Humanities, electives, etc.
- `scheduler.js`: the screen. Reads the plan through `window.PawPlanBridge` in `index.html`.
- `data/terms.json`: list of available terms. `data/<term>.json`: that term's sections.

## Each new semester, and refreshing during registration

Easiest: upload the Schedule of Classes CSV to the `class-schedule-upload/` folder on github.com
(Add file > Upload files). A GitHub Action (`.github/workflows/refresh-class-data.yml`) converts it,
removes the CSV, and publishes. The file name must include the term, such as
`Spring_2027_Schedule_of_Classes.csv`. See `class-schedule-upload/README.md`.

By hand:

```
python3 tools/build_schedule_data.py "Fall 2027" path/to/Fall_2027_Schedule_of_Classes.csv --as-of 2027-03-20
```

`--as-of` is the download date. Commit the new `scheduler/data/` files. The builder uses whichever
listed term matches a semester in the student's plan.

## Electives and extra classes

Elective lists in the audit view have filter chips: ARE courses, Online, Mon/Wed/Fri, Tue/Thu, and
1–2 credits. A free elective opens on ARE courses (300–400 level first) so there is something to
browse; typing a search covers every subject. "+ Add another class" adds a class beyond the
requirements (a Free Elective slot marked `schedExtra`; Remove deletes it). Courses on Paw Plan's
`FREE_EXCLUDED` list never appear as free electives.

Agricultural Institute (AGI) courses never count toward the BS, so they are never shown: the AGI
subject, any course or section whose requirement text names AGI or the Agricultural Institute, and
the courses listed under `agiCourses` in `data/overrides.json` (ARE 104, 113, 115, 132 and HS 121,
141, which the catalog text does not mark).

Courses with no meeting time (online, study abroad, TBA) appear in a "No set time" row at the top
of the weekly calendar.

## Seats go stale

The class data is a snapshot. Students do not see seat counts (advisors see them with the date).
The audit view says "Sections as of <date>" and tells students to put picks and backups in the
MyPack shopping cart, which shows live seats. Each picked section has a "Full in MyPack?" button:
it marks that section full (saved on the plan as `schedFull`), swaps in the best backup that still
fits, and opens the choices if none does. Marked sections are never suggested again until the
student clicks Undo.

## Department corrections

`data/overrides.json` lists courses the department knows will not run, even when the Schedule
of Classes shows an active section. Add the course code under the term's
`notOffered` list and commit; no rebuild is needed.

## Department substitutions

`data/overrides.json` also holds `substitutions`, which apply every term. `"AEE 226": ["ARE 255"]`
means ARE 255 fills the AEE 226 requirement: it is offered first wherever AEE 226 is an option,
and a student who already has ARE 255 sees AEE 226 as met (with a reminder to confirm it on the
audit).

## Courses at another school

In the audit view, any remaining requirement can be marked "Taking it at another school" with the
school, course, and term. It moves to that term in the plan, is not scheduled here, and shows a
reminder to confirm transfer credit.

For NC community colleges, `data/transfer-nccc.json` holds the course mappings from NC State's
CAA transfer guide for Agricultural Business Management (2026-27, revised May 2026). The form
suggests the guide's course for each requirement (for example MAT 152 for ST 311), checks what the
student types, and flags a course that transfers as something else. No community college course is
suggested for a requirement with an ARE option. Courses outside the guide, and other schools, point
to the NC State transfer database. Update the file from the new guide each year.

## What it checks

- Time conflicts, including 8-week sessions and the student's busy times.
- Lecture + lab / recitation / problem session pairing (sections sharing an Assoc Class number).
- Closed, cancelled, and tentative sections are left out (a tentative section is treated as not
  offered). Students never see them. Before registration, a closed section is usually held back by
  its department rather than full, so it is not listed either. Revisit once registration opens.
- Sections with seat restrictions (reserved for another program, honors, consent required, class
  standing or GPA the student may not meet) are shown in the audit view as dashed time choices with
  a plain-language caveat, after the open sections. A student can pick one; the caveat follows the
  pick into the class number list and Plans A, B, C, and the advising check flags it. Automatic
  plans and auto-pick never choose a restricted section on their own.
- Study abroad sections (instruction mode SA, such as ARE 494) are kept. They show the travel dates
  instead of a meeting time, are marked "for students accepted into the program," appear last in
  each list, and are never picked automatically, used as a backup, or suggested to pull ahead. A
  student picks one in the audit view.
- Section restrictions it can read (class standing, ABM-only, GPA from the audit). A restriction
  it cannot verify, such as other majors only, is shown as a caveat rather than hidden.
- Prerequisites are flagged from catalog text, never enforced.
- ARE over Poole: when a requirement can be met by an ARE course (EC/ARE 301, ARE 321/323 or
  BUS 320), the Poole option (EC, BUS, ACC, MIE, MBA) is never suggested while the ARE course is
  offered and open to the student. In elective lists, ARE courses rank above Poole courses.

## Checking plans against audits

`tools/check_audits.sh /path/to/audit-pdfs` uploads each audit PDF to a local copy of the site
(`tools/dump_plan.js`) and compares the plan with the audit (`tools/check_audit_plan.py`). For
every unmet audit line, the plan's future slots must add up to the credits the audit says remain,
and no future slot may appear that the audit does not ask for. It reads the audit text on its own,
without Paw Plan's parser. Run it before each change. Keep the audit PDFs outside the repository;
they hold student names and IDs. When a new requirement description shows up, add it to `REQS` in
`check_audit_plan.py`.

## Audit-first import (testing)

`index.html?auditfirst=1` builds the future plan straight from the audit's unmet lines: each line
becomes slots with the count and credits the audit reports, and the standard four-year template
only decides the starting semester (required courses first, then electives, never in the current
in-progress term, spilling past 17 credits). Audit lines Paw Plan cannot map become a visible
"Not recognized by Paw Plan" slot instead of being dropped. It is off by default; `?auditfirst=0`
forces the current import. To compare both on a folder of audits:
`QUERY='?auditfirst=1' tools/check_audits.sh /path/to/audits`.

## Summer

`data/summer-2027.json` comes from a workbook pulled from NC State's public course catalog
(`tools/build_coursecat_xlsx.py "Summer 2027" NC_State_Summer_2027_Classes.xlsx`). Sections carry
their session (Summer I, Summer II, 10-week, Maymester) and dates; most have no set meeting time.
The catalog gives no Assoc Class numbers, so a lecture pairs with labs from the same session.
When a student's plan has more than one listed term, the audit view shows term tabs (Spring 2027 |
Summer 2027). Planning summer after spring: spring slots not yet picked stay choosable, and spring
picks count as taken. Summer shows credits per session instead of full-time/overload notes.


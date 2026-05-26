# Paw Plan Test Bundle

**Commit:** 5e9dcfa1e523de9503245f38cff60242de9560c1
**Build id:** reflow-final-v7
**Features:** planned-current placement, foundation priority, prereq-aware forward-pull compaction, ARE 490 tail cleanup, tiny-final-semester merge, section-aware category fallback, free-electives diagnostic
**Generated:** 2026-05-26T19:23:53Z

## New in v7 (vs v6)

- Section-aware category fallback: audit section context beats the generic 'free' fallback in cat assignment.
- window.pawPlanDiagnoseFreeElectives() in DevTools console lists every cat='free' course with its audit section + reason.

## Free-electives diagnostic (in DevTools)

```javascript
window.pawPlanDiagnoseFreeElectives();
// returns a table-printed list of every course currently in plan with cat='free',
// including audit section so you can confirm section-6 items did NOT leak.
```

## Expected per audit (unchanged from v6)

### Preston
`Fall 2026: 14 (5 planned)  Spring 2027: 16  Fall 2027: 15  Spring 2028: 10 (ARE 490)`

### Audit A
`Fall 2026: 17  Spring 2027: 15  Fall 2027: 15  Spring 2028: 17  Fall 2028: 8 (ARE 490)`

### Audit B
`Fall 2026: 17 (7 planned)  Spring 2027-Fall 2028: 15-16 each  Spring 2029: 17 (ARE 490)`

### Micah
`Fall 2026: 15 (5 planned)  Spring 2027: 17 (incl ARE 201)  Fall 2027: 16  Spring 2028 - Spring 2029: 15 each  Fall 2029: 8 (ARE 490)`

# Paw Plan Test Bundle

**Commit:** 493c058c879254eabf6c762bcb6be7748d82d4db
**Build id:** reflow-final-v4
**Features:** planned-current placement, foundation-course priority, forward-pull compaction with prereq check, trailing-empty trim
**Generated:** 2026-05-26T16:17:45Z

## Verify you have the latest file

Yellow banner at top should read:
```
Build: 493c058c879254eabf6c762bcb6be7748d82d4db  Â·  Reflow fix: yes  Â·  Generated: 2026-05-26T16:17:45Z
```

DevTools console (F12):
```javascript
console.log(window.pawPlanBuildId);  // expect: "reflow-final-v4"
console.log(document.title);          // expect: contains "[build reflow-final-v4]"
```

## After uploading any audit PDF

```javascript
const s = window.summarizeImportedAuditPlan();
const byTerm = {};
s.future.forEach(c => { byTerm[c.term] = byTerm[c.term] || []; byTerm[c.term].push(c); });
Object.keys(byTerm).forEach(t => {
  const cr = byTerm[t].reduce((x,c)=>x+(c.units||0), 0);
  console.log(t + ': ' + cr + 'cr / ' + byTerm[t].length + ' courses');
});
```

## Expected behavior per audit

### Preston (the rising-junior audit)
Distribution should be roughly **14 / 16 / 15 / 9 / 1** across Fall 2026 -> Spring 2028 + Fall 2029 (ARE 490 final).
Fall 2028, Spring 2029, Spring 2030 trimmed as trailing empties.

### Micah
Fall 2026 = 15 cr (5 audit-planned only). Spring 2027 = 17 cr including **ARE 201**. ARE 490 in Fall 2029.

### Audit B
Fall 2026 = 17 cr (7 audit-planned only). Spring 2027 onward distributes remaining requirements. ARE 490 in Fall 2029.

### Audit A
No audit-planned items; full plan distributed across Fall 2026 -> Fall 2029 with ARE 490 final.

## Constraints enforced

- No auto-generated semester > 18 cr
- Audit-planned semesters not overfilled
- ARE 490 stays in one of the last three active coursework terms
- ARE 201 (and other foundation slots) placed as early as possible if unmet
- Prerequisites respected: a course is only pulled forward if its prereqs are satisfied by an earlier semester or by completed / transfer / planned-current

## Commit-pinned downloads (immutable)

* HTML: https://raw.githubusercontent.com/jtreme/AREAdvising/<NEXT_COMMIT>/paw-plan-test.html
* Zip:  https://github.com/jtreme/AREAdvising/raw/<NEXT_COMMIT>/paw-plan-test-latest.zip

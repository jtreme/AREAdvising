# Paw Plan Test Bundle

**Commit:** 1ef9b3d9feaa316c8fa169e9d54949ef9d67b01b
**Build id:** reflow-final-v5
**Features:** planned-current placement, foundation-course priority, prereq-aware forward-pull compaction, ARE 490 tail cleanup, trailing-empty trim
**Generated:** 2026-05-26T16:30:08Z

## Verify you have the latest file

Yellow banner reads:
```
Build: 1ef9b3d9feaa316c8fa169e9d54949ef9d67b01b  Â·  Reflow fix: yes  Â·  Generated: 2026-05-26T16:30:08Z
```

DevTools console:
```javascript
console.log(window.pawPlanBuildId);  // expect: "reflow-final-v5" (after upload)
console.log(document.title);          // expect: contains "[build reflow-final-v5]"
```

## Expected per audit

### Preston
```
Fall 2026: 14 cr (5 planned)
Spring 2027: 16 cr
Fall 2027: 15 cr
Spring 2028: 10 cr  including ARE 490   <- moved here from Fall 2029
```

### Audit A
```
Fall 2026: 17 cr
Spring 2027: 15 cr
Fall 2027: 15 cr
Spring 2028: 17 cr
Fall 2028: 8 cr  including ARE 490   <- moved here from Fall 2029
```

### Audit B
```
Fall 2026: 17 cr (7 planned)
Spring 2027: 16 cr
Fall 2027: 15 cr
Spring 2028: 15 cr
Fall 2028: 15 cr
Spring 2029: 15 cr
Fall 2029: 2 cr  ARE 490 + HES 100/200  (already final active term, no move)
```

### Micah
```
Fall 2026: 15 cr (5 planned)
Spring 2027: 17 cr  including ARE 201
Fall 2027: 16 cr
Spring 2028: 15 cr
Fall 2028: 15 cr
Spring 2029: 15 cr
Fall 2029: 8 cr  ARE 490 + 3 others
```

## Commit-pinned downloads (immutable, see next commit for actual file URLs)

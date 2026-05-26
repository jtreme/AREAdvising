# Paw Plan Test Bundle

**Commit:** 7a1c63d23a10f95c00f66f5abea2607af01af477
**Build id:** reflow-final-v6
**Features:** planned-current placement, foundation priority, prereq-aware forward compaction, ARE 490 tail cleanup, tiny-final-semester merge, trailing-empty trim
**Generated:** 2026-05-26T16:37:49Z

## Verify

Yellow banner reads:
```
Build: 7a1c63d23a10f95c00f66f5abea2607af01af477  Â·  Reflow fix: yes  Â·  Generated: 2026-05-26T16:37:49Z
```

DevTools:
```javascript
console.log(window.pawPlanBuildId);  // "reflow-final-v6" after upload
console.log(document.title);          // contains "[build reflow-final-v6]"
```

## Expected per audit

### Preston
```
Fall 2026: 14 cr (5 planned)
Spring 2027: 16 cr
Fall 2027: 15 cr
Spring 2028: 10 cr  including ARE 490
```

### Audit A
```
Fall 2026: 17 cr
Spring 2027: 15 cr
Fall 2027: 15 cr
Spring 2028: 17 cr
Fall 2028: 8 cr  including ARE 490
```

### Audit B
```
Fall 2026: 17 cr (7 planned)
Spring 2027: 16 cr
Fall 2027: 15 cr
Spring 2028: 15 cr
Fall 2028: 15 cr
Spring 2029: 17 cr  including ARE 490   <- merged from Fall 2029 (was 2 cr)
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

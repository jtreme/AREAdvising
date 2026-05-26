# Paw Plan Test Bundle

**Commit:** 637232585aff5fe923b61604cb9ecc3a56f0a5c7
**Reflow fix:** yes
**Generated:** 2026-05-26T15:53:07Z

## How to use

1. Open `paw-plan-test.html` in Chrome (double-click).
2. You should see a yellow build stamp banner at the top of the page reading:
   ```
   Build: 637232585aff5fe923b61604cb9ecc3a56f0a5c7  Â·  Reflow fix: yes  Â·  Generated: 2026-05-26T15:53:07Z
   ```
   If you do not see that banner, you have an old file.

## Verifying you have the latest file

In Chrome DevTools console (F12):

```javascript
// Expected:
//   pawPlanBuildId = "reflow-final-v2"
//   sha-256 of the file matches the SHA published in the commit message
console.log(window.pawPlanBuildId);
console.log(document.title);
console.log(document.getElementById('paw-plan-build-stamp')?.textContent?.trim());
```

## After uploading an audit PDF

```javascript
const s = window.summarizeImportedAuditPlan();
const f26 = s.future.filter(c => c.term === 'Fall 2026');
console.log('Fall 2026:', f26.reduce((t,c)=>t+(c.units||0),0), 'cr,', f26.length, 'courses');
f26.forEach(c => console.log(' ', c.code, '(' + c.units + 'cr)', c.classification || '(default slot)'));
```

For Micah's audit, Fall 2026 should now read **15 cr / 5 courses**, all classified `planned_current`:

* CH 221 (3 cr) planned_current
* CH 222 (1 cr) planned_current
* PY 211 (4 cr) planned_current
* EC 205 (3 cr) planned_current
* MA 242 (4 cr) planned_current

If you see any course with no classification (a default-template leftover), the reflow did not run. That means the file is stale.

## Direct download

Always-current branch (may be cached):
https://raw.githubusercontent.com/jtreme/AREAdvising/claude/fervent-carson-f6TSI/paw-plan-test.html

Commit-pinned (immutable, see commit message for the exact hash):
https://raw.githubusercontent.com/jtreme/AREAdvising/<COMMIT_HASH>/paw-plan-test.html

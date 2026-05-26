# Paw Plan Test Bundle

**Commit:** 195de282f1f6c4cb31e6b5404f08d79710f15a32
**Build id:** reflow-final-v3
**Reflow fix:** yes (with foundation-course priority)
**Generated:** 2026-05-26T16:02:29Z

## How to use

1. Open `paw-plan-test.html` in Chrome (double-click).
2. You should see a yellow build stamp banner at the top reading:
   ```
   Build: 195de282f1f6c4cb31e6b5404f08d79710f15a32  Â·  Reflow fix: yes  Â·  Generated: 2026-05-26T16:02:29Z
   ```
   If that banner is missing or shows a different hash, you have a stale file.

## DevTools sanity check (F12 console)

```javascript
console.log(window.pawPlanBuildId);          // expect: "reflow-final-v3"
console.log(document.title);                 // expect: contains "[build reflow-final-v3]"
console.log(document.getElementById('paw-plan-build-stamp')?.textContent?.trim());
```

## After uploading an audit PDF

```javascript
const s = window.summarizeImportedAuditPlan();
const f26 = s.future.filter(c => c.term === 'Fall 2026');
console.log('Fall 2026:', f26.reduce((t,c)=>t+(c.units||0),0), 'cr,', f26.length, 'courses');
f26.forEach(c => console.log(' ', c.code, '(' + c.units + 'cr)', c.classification || '(default slot)'));
const s27 = s.future.filter(c => c.term === 'Spring 2027');
console.log('Spring 2027:', s27.reduce((t,c)=>t+(c.units||0),0), 'cr');
s27.forEach(c => console.log(' ', c.code, '(' + c.units + 'cr)'));
```

### Expected for Micah's audit

* **Fall 2026 = 15 cr / 5 courses**, all `planned_current`:
  CH 221, CH 222, PY 211, EC 205, MA 242
* **Spring 2027** contains foundation courses including **ARE 201** (not pushed to Year 3 anymore).

If you see any course with no classification in Fall 2026 it means the reflow did not run.
If ARE 201 is in Fall 2028 or later it means the foundation priority did not run.
Either symptom means the file is stale.

## Direct downloads (commit-pinned, immutable)

* HTML: https://raw.githubusercontent.com/jtreme/AREAdvising/195de282f1f6c4cb31e6b5404f08d79710f15a32/paw-plan-test.html
* README: https://raw.githubusercontent.com/jtreme/AREAdvising/195de282f1f6c4cb31e6b5404f08d79710f15a32/paw-plan-test-README.md
* Zip: https://github.com/jtreme/AREAdvising/raw/195de282f1f6c4cb31e6b5404f08d79710f15a32/paw-plan-test-latest.zip

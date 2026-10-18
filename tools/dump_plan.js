// Upload a degree audit PDF to a local copy of Paw Plan, the way a student does, and save the
// plan it builds. Used with tools/check_audit_plan.py.
//
//   python3 -m http.server 8765            (from the repo folder)
//   node tools/dump_plan.js audit.pdf plan.json [http://127.0.0.1:8765]
//
// Needs Playwright with Chromium. If the page cannot reach cdnjs for pdf.js, set PDFJS_DIR to a
// folder holding pdf.min.js and pdf.worker.min.js (for example node_modules/pdfjs-dist/build).
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const path = require('path');
const [pdf, out, base] = process.argv.slice(2);
if (!pdf || !out) { console.error('usage: node tools/dump_plan.js audit.pdf plan.json [base-url]'); process.exit(2); }

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await (await browser.newContext({ viewport: { width: 1360, height: 1000 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (process.env.PDFJS_DIR) {
    await page.route(/cdnjs\.cloudflare\.com\/.*pdf(\.worker)?\.min\.js/, r => r.fulfill({
      path: path.join(process.env.PDFJS_DIR, r.request().url().includes('worker') ? 'pdf.worker.min.js' : 'pdf.min.js'),
      contentType: 'application/javascript'
    }));
  }
  await page.route(/fonts\.(googleapis|gstatic)\.com|gc\.zgo\.at/, r => r.abort());
  await page.goto((base || 'http://127.0.0.1:8765') + '/index.html');
  await page.waitForTimeout(700);
  await page.evaluate(() => document.getElementById('transcript-btn').click());
  await page.waitForTimeout(300);
  await page.setInputFiles('#transcript-file', pdf);
  await page.waitForTimeout(2500);
  for (const b of await page.$$('#modal-body button')) {
    if (/confirm|use|start|continue|build/i.test(await b.textContent() || '')) { await b.click(); break; }
  }
  await page.waitForTimeout(1500);
  const plan = await page.evaluate(() => window.PawPlanBridge.getPlan().map(s => ({
    term: s.term,
    courses: s.courses.map(c => ({ code: c.code, units: c.schedOrigUnits || c.units, schedOrigCode: c.schedOrigCode || '', schedExtra: !!c.schedExtra, transferPlan: !!c.transferPlan }))
  })));
  fs.writeFileSync(out, JSON.stringify(plan, null, 1));
  if (errors.length) console.error('page errors: ' + JSON.stringify(errors));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();

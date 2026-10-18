#!/usr/bin/env bash
# Check Paw Plan against a folder of degree audit PDFs: for each one, upload it to a local copy
# of the site, save the plan, and compare it with the audit (tools/check_audit_plan.py).
#
#   tools/check_audits.sh /path/to/audit-pdfs [term]
#
# Keep student audits outside the repository: they hold names and IDs.
# Needs pdftotext (poppler), Node with Playwright, and Python 3.
set -u
dir="${1:?folder of audit PDFs}"; term="${2:-Spring 2027}"
here="$(cd "$(dirname "$0")/.." && pwd)"; work="$(mktemp -d)"; fails=0
port=8765
if ! curl -s -o /dev/null "http://127.0.0.1:$port/index.html"; then
  (cd "$here" && python3 -m http.server "$port" >/dev/null 2>&1 &); sleep 1
fi
shopt -s nullglob nocaseglob
for pdf in "$dir"/*.pdf; do
  name="$(basename "$pdf")"
  pdftotext -layout "$pdf" "$work/a.txt"
  if ! grep -q '[A-Z]\{2,4\} [0-9]\{3\}' "$work/a.txt"; then echo "== $name: no text in this PDF (image only), skipped"; continue; fi
  if ! node "$here/tools/dump_plan.js" "$pdf" "$work/p.json" "http://127.0.0.1:$port"; then echo "== $name: upload failed"; fails=$((fails+1)); continue; fi
  echo "== $name"
  python3 "$here/tools/check_audit_plan.py" "$work/a.txt" "$work/p.json" --term "$term" | grep -v '^  ok' || true
  python3 "$here/tools/check_audit_plan.py" "$work/a.txt" "$work/p.json" --term "$term" >/dev/null || fails=$((fails+1))
done
rm -rf "$work"
echo "$fails audit(s) with mismatches"
[ "$fails" -eq 0 ]

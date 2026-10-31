# Cost register

One offline HTML file (`cost-register.html`) that reads SAP export workbooks from a project folder, keeps them in a SQLite database
inside that folder, and shows Overview, Explore, Export and Mapping screens. CJI3 is the ledger; the other reports are detail that is
compared to it. No server, no install, no network: Chrome or Edge on a desktop. Data never leaves the machine.

## Using it

1. Open `cost-register.html` in Chrome or Edge.
2. **Connect folder** and pick the project's own folder (not Desktop, Documents or Downloads: the browser blocks those).
   The folder name is the project name. The tool creates `cost.db` and an `Output` folder inside it.
3. **Files** lists every `.xlsx` in the folder (not `Output`, not `~$` temp files). Each file is recognised from its header row, never
   from its name, and shows New, Changed, Unchanged, Unrecognized or Other project. Press **Import N files**; nothing imports before that.
4. **Overview**, **Explore**, **Export** (values-only workbook in `Output`), **Mapping** (cost bucket rules).

Your SAP files are never modified.

## Reports it recognises

| Report | Table | Load mode | Line key |
|---|---|---|---|
| CJI3 | `cji3` | upsert | document number + posting row + fiscal year |
| ZSCPRG01 | `zscprg01` | upsert | PO + invoice serial + item + number + line + WBS |
| ZSCSRV1 | `zscsrv1` | upsert | PO + item + service line |
| ZINTC1 | `zintc1` | replace the months in the file | none (identical rows are real money, never de-duplicated) |
| MB51 | `mb51` | upsert | material document + year + item |
| ME2N | `me2n` | upsert | PO + item |
| MB52 | `mb52` | replace with the newest snapshot | none |

Upsert: new lines insert, known lines update in place, so overlapping or wider exports never duplicate. If a key is not unique inside a
file the import stops and says so (nothing is silently de-duplicated). Column matching is by caption, so the 54- and 79-column CJI3
layouts both load; repeated captions keep their first copy.

Rules built in (from the CJI3 reference): rows with a blank document number are SAP subtotals and are skipped (the grand total is used to
check the file); cost (3xxxxxxx) and revenue (4xxxxxxx) are never netted; the month is the posting date, not the fiscal period; go-live
opening balances (UE, ZB, MD, HT) are their own series; a file whose project differs from the folder's is not imported.

## Developing

```bash
npm install            # only needed for the tests (xlsx); the app itself has no dependencies
node build.mjs         # src/ + vendor/ -> cost-register.html (everything embedded)
node tests/unit.cjs    # unit tests, no data needed
node tests/e2e.cjs <folder with real SAP exports>   # headless Chromium, real files, independent totals
```

* `src/util.js` normalisers (dates, amounts, WBS, project key) - shared by the page, the worker and the tests.
* `src/reports.js` **report definitions**: add a report by adding one entry (and its captions to `src/headers.js`, which
  `tools/gen-headers.py` generates from a sample export).
* `src/worker.js` XLSX parsing and the database (sql.js) in a Web Worker, so the page never freezes.
* `src/app.js` the screens, and the `Store` (the only door to the database - a heavier backend can replace the worker behind it)
  and `FS` (folder access) modules.
* `vendor/` SheetJS (Apache-2.0), sql.js (MIT) and Chart.js (MIT), embedded at build time.

## Not built yet

Reconciliation of CJI3 against the detail reports (by PO, by order, by material), the anomaly review from the earlier dashboard, and
the offline Labour and Asset sheets. The Overview already shows which detail reports are loaded and the months they cover.

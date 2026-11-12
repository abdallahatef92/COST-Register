# Cost register

Project cost register for SAP PS/CO. **CJI3 is the single source of truth** for actual cost. It is split into buckets (Material, Subcontractor, Equipment, G&A …),
each bucket is coded once on a unique list (and per line where needed), and one **Expenses** sheet collects every item of every bucket with its codes.
Every bucket reconciles to CJI3; the Summary shows the difference (must be 0). Analysis happens afterwards, outside this tool.

## Status

Stage 1 (CJI3 core + all buckets from CJI3 + Material groups) is built and verified. Still to come: Subcontractor detail (ZSCPRG01/ZSCSRV1, PO view),
ZINTC1 detail (equipment, fleet, house rent), Labor and Depreciation offline sheets, Material PO views (ME2N).

## Run

```bash
npm install
node bin/register.js --cji3 CJI3.xlsx --mb52 MB52.xlsx --zscprg01 ZSCPRG01.xlsx --zscsrv1 ZSCSRV1.xlsx --prev LastRegister.xlsx --project SUTH --out out/Cost_Register.xlsx
```

Only `--cji3` is required. `--prev` brings last month's codes and typed-over lines back in (matched by item key and by line id).

## Workbook

| Sheet | What it is |
|---|---|
| Summary | Bucket totals, reconciliation to CJI3, revenue kept apart |
| Expenses | Every item of every bucket, by month, with PKG / MNL / Cost element code (live links) |
| `<Bucket> Coding` | Unique list: code each item once (yellow); Include per item; status and KPI band |
| `<Bucket> Data` | One row per CJI3 line; codes and Include are formulas reading the Coding sheet – type over to code or exclude one line |
| `<Bucket> per Month` | Allocation per month (Material also Qty and Rate) |
| Revenue Data, Rules, Checks | Revenue lines, the classification rules, control checks |

Rules for CJI3 lines are in `src/rules.js` (first match wins). `tools/verify_recalc.py` compares the numbers the tool computes with an independent LibreOffice recalculation.

### Subcontractor VAT
As in the Subcontract report, the Summary has a VAT switch (B5: Exclude VAT / Include VAT / Include VAT before date, date in C5). Default: Exclude VAT (net, as CJI3). `--vat exclude|include|before --vatfrom yyyy-mm-dd` only set what the file opens with. Subcontractor Data: Amount = Net amount + VAT in amount; the Summary reconciliation shows the VAT included as its own line, so the difference to CJI3 stays 0. Quantities always use the net amount; rates follow the amount.

### Equipment / fuel, Fleet, House rent (ZINTC1)
Give the internal-order charges report ZINTC1 (`--zintc1 f`, repeat for 2025 + 2026; the tool recognises it by its columns). Every CJI3 order settlement (Partner Object = order, per posting month) that ZINTC1 explains is replaced by the ZINTC1 rows behind it, so you code per equipment unit / trip type (activity type, days × rate), fuel order (litres) and apartment (HOUS order). Charges settled in a later month (e.g. November charged, December settled) take the CJI3 posting month. A settlement that differs from its rows keeps a "Settlement difference" row; CJI3 settlement lines without ZINTC1 rows stay as they are, so each bucket still equals CJI3. Rows are never de-duplicated (ZINTC1 has no document number; equal rows are real repeated charges). If two files hold the same month, the newer download wins for that month.

ZINTC1 charges CJI3 has **not settled yet** (house rent since Feb-26, the duplicate Jan-26 fleet timesheets, a fuel order's April, everything after the CJI3 data) are left out by default. The app's **Unsettled** tab shows them per month (one row per SAP order, its component – equipment type, trip charge – in a column); one click includes them – "Include all up to the cut date" (follows the cut date) or month by month by clicking the month switch; the Order switch leaves one order out whatever the month. Included charges are counted in their buckets and shown on the Summary as "+ CJI3 difference: ZINTC1 charges not yet settled, included by you", so the difference to CJI3 stays 0. The choice is saved with your codes. The Excel register leaves them out. Checks list them by order type.

### Subcontractor certificates not in CJI3 (app)
Certificates in ZSCPRG01 that are approved (Character 1 = X) but not yet posted in CJI3, and certificates not approved, are kept as "not yet in CJI3" lines (net of VAT, month = certificate date) and listed on the **Unsettled** tab, view "Certificates (Subcontractor)": Type of works › PO › service (one row per service per PO under +/−, all certificates added up; approval shown as Approved / Not approved / Mixed, certificate numbers in the tooltip). Each month shows Qty · Rate · Amount (quantities only where one unit applies: service rows, single-unit orders and lines); − above a month folds it to Amount, "− Amounts only" folds every month. Left out by default; this view has its own switches (separate from "Orders (ZINTC1)") and its own Summary line "+ CJI3 difference: certificates not in CJI3". Posted certificates keep the CJI3 posting month; posted after the cut date they are Pending. The Excel register leaves them out.

### Status bar (app)
A bar at the bottom of every tab: CJI3 cost, counted to the cut date, this month, pending, difference to CJI3 (green ✓ when 0), and what you changed – excluded, VAT included, ZINTC1 orders included, certificates included, depreciation excluded – plus the coded share and hand-coded lines. Click an entry to open its tab.

### Layout (app)
One header with the 5 steps of the month – **1 Code · 2 Subcontractor · 3 Adjust · 4 Check · 5 Reports** – and a sidebar on the left with the list you work through; the table takes the rest of the screen. « hide folds the sidebar to a thin rail (remembered).
- **Code**: the buckets with coded % and amount; the open bucket lists its groups (click one to show only it). Rules is at the bottom of the list.
- **Material › Rate analysis** (switch "Coding · Rate analysis" above the Material table), two levels: **Material group** (default – one row per SAP material group and unit, e.g. M030201 Steel Bars · TO, a dot per material at its rate to date, green lowest / red highest, a line for the group average; latest = the group's rate in its latest month; PKG / MNL / Cost element typed on the row go to every material of the group, 'mixed' when they differ; click for a card per material) and **Material**: one row per material with its rate in every month up to the cut date (amount ÷ quantity, the moving price) as dots on a range – green lowest, red highest, ringed the latest month, a line for the average – plus the average, the latest rate and its month, the change vs the month before, the spread, to date, and PKG / MNL / Cost element on the same row. Click a row for a card per month (rate, quantity, amount, % vs average). Filters: All · Spread ≥ 10% · ▲ Up · ▼ Down · Not coded; the sidebar family / group narrows it; "Fill empty" codes every material shown that has the code empty.
- Status is **Coded** (every code filled) or **Not coded** – no "partly coded" in the Tool.
- **Material families** (M Materials, P Plant & tools, SP Spare parts, SM Safety, SH Site housing, CS, OS, IT, G): the sidebar lists the families, each opening to its groups; click a family to show only it. In Coding and Per Month the table has a family row above its groups (with To date / This month, or the months, added up) and a zoom: **Families · Groups · Items**.
- **Subcontractor**: the packages (see below); More: Overview, POs, PO register, Bridge to CJI3.
- **Adjust**: what is not yet in CJI3 (ZINTC1 orders not settled, certificates not in CJI3 – include?) and what is in CJI3 but you may take out (depreciation – exclude?).
- **Check**: the live checks. **Reports**: Summary, Per Month, Expenses, GL, WBS, and Lines (every CJI3 posting).

Tables: light headers and hairline borders. Columns are fitted to what they hold (header and values); drag a header's right edge to change a width (kept in this browser), double-click it to fit again, "↔ Fit" refits the whole table, "Columns ▾" shows or hides columns (Coding hides Pending, Lines, New by default).

### Summary (app) – one screen
Six cards (to date, this month vs last, 6-month average, net revenue, revenue − cost, difference to CJI3 with coded %); **This month by bucket** (last month, this month, change with a −/+ bar, to date, share, coded %; click a bucket to code it, double-click a number for its items); **Cost per month** (every bucket in its own colour, 6-month average line); **Cost drivers** – the largest material groups, subcontractor work items, G&A lines and equipment: rate (or cost per month for G&A) this month, 6-month average, vs average, vs last month, trend, this month's cost, to date and share, with subtotals and a total (about 55% of the cost to date on SUTH); reconciliation, what needs attention, revenue. One colour per bucket everywhere in the Tool.

**Reports › Cost drivers** (also "Full list – all buckets ›" on the Summary): every bucket, drivers added largest first until the chosen share of the bucket is covered – **50% · 80% (default) · 95% · All** – with the same columns as the Summary; bucket chips to filter (click one, Ctrl+click to add more, All buckets to reset); filters ▲ above / ▼ below average by 5% or more, no cost this month; search; click a bucket header to fold it; click a driver for its detail (material groups open the rate analysis). A **Type of works / group** column (Subcontractor type of works, Material division, G&A sub-group) and a switch **Group by type · List**: grouped, each bucket's drivers sit under their type with a subtotal row (click to fold). On SUTH: 80% cover = 142 drivers, 82% of the cost to date.

### One table standard (app)
Every table in the Tool works the same way:
- **Bucket chips** (colour · name · a figure) on every page that shows buckets – Code, Per Month, Lines, GL, WBS, Cost drivers. Click = one bucket; **Ctrl+click adds more** where several make sense (Lines, GL, WBS, Cost drivers); All buckets resets.
- **Columns fit their content**; **drag a header edge** to resize (kept in this browser), double-click it to fit again; **↔ Fit** refits the table.
- **Click a header to sort** (custom tables: Cost drivers, Rate analysis, Rates & coding, Review, Checks, Changes – rows stay inside their group); the main tables also have the ▾ value filter and Columns ▾.
- **Tick a whole group**: the tick box on a group (or family) row ticks every item in it that passes the filters, ready for Apply to selected.
- **Grouped tables fold**: click a group row; a zoom switch folds all at once – Families · Groups · Items (Material), Buckets · Types · Drivers (Cost drivers).

### PKG summary (app) – Cost Report Grand Summary
Reports › PKG summary: the company template, actual cost (AC) accumulated to the cut date. **Direct** = every PKG except "Indirect", rows grouped Civil · Arch · MEP (editable); **Indirect** = PKG "Indirect", rows are its cost elements (SF-…, SP-…, TR-…, SE-…) in the template's groups. Codes not in a group and lines without a PKG show separately, so the total always equals the counted cost (ties to CJI3).
Drill with + / −: PKG › MNL › your cost element (named after its largest item) › items › CJI3 lines; Indirect: cost element › MNL › items. Zoom: Sections · Groups · Rows · MNL · Cost element. Double-click an amount for its items. **Codes & groups** (switch at the top): the report's own rows, editable – Direct (your PKGs, in groups you create) and Indirect (the template's groups and cost elements of PKG "Indirect"). Each code: name and group; new codes from your coding appear under "Not in a group yet"; "+ Add" defines a code before coding, "+ New group" adds a group; group names are edited in place. Only the Indirect tree comes from the template; Direct starts empty. Kept with your codes.

### Indirect presets (app, v02)
Indirect items (G&A, Equipment, Fleet, House rent, Depreciation) are pre-coded from the SAP GL that carries most of their cost: PKG "Indirect", the indirect cost element of the template (SF-01 salaries, SF-02 outside hire, SF-03 security, SP-02 housing, SP-09 furniture depreciation, SP-14 advertising, SP-15 IT, SP-16 stationery, SP-17 hospitality & meals, SP-18 medical, SP-19 utilities & telephone, SP-28 other, TR-01 fleet & car allowance, TR-02 material transport, SE-03/07/11/01/05/08/17 equipment by the order name, SE-13 scaffolding, SE-16 wood depreciation, SE-17 other equipment, SE-18 fuel & oils, SE-19 spare parts & maintenance, SS-01 consultancy, CO-01 consultant fees, Sponsorship for LG / bank / insurance / taxes / government / manpower) and MNL OTHER (EQU for equipment and fleet). Mapped from the CJI3 master file, corrected to the template (no CO-01 catch-all). Fills empty codes only, at every build (one undo step); listed on Code › Rules with On/Off and "Fill empty codes now". Material, Subcontractor, Labor and Sub deductions stay direct.

### Monthly workflow (app)
- **Month-close checklist** on the 5 steps: Code shows the coded share, Subcontractor the POs in a package (e.g. 133/240), Adjust whether the include / exclude decisions are made, Check ✓ when every reconciliation check is OK, Reports whether everything is saved.
- **Coding rules**: a code typed on a material group (Material › Rate analysis) or a subcontractor work item becomes a rule; new items of that group / service are coded automatically at the next build. Listed on Code › Rules (delete, "fill empty codes now"); kept with Save codes; exported as a sheet.
- **New this month**: a filter in Coding and counts in the sidebar; in Subcontractor › Packages new POs are marked and each PO not in a package gets a suggestion – the package its type of works already uses (✓ to accept one, "Accept N suggestions" for all).
- **Unsaved changes**: the status bar counts changes not yet in a saved file (click to save); Save codes and Export Excel clear it; the browser warns before closing.
- **Changes**: every change (and undo / redo) with date, time, cells and cut date – Check › Changes, kept with Save codes, exported as a sheet.
- **Drill-down**: double-click a bucket × month on the Summary, or a cell in Per Month (item, group or family row): the items behind the number slide in from the right; click an item for its CJI3 lines.
- Cut dates are offered only up to the last CJI3 posting. Status is Coded / Not coded in the Tool and the Excel register. Excel export adds Material families, Packages, Subcontractor rates, Material rates, Coding rules and Changes.

### Subcontractor (app): 1 Packages · 2 Rates & coding · 3 Review
1. **Packages** – the sidebar lists Not allocated, your packages (key 1…0, POs, amount) and All POs; "+ Add package" adds a code and an optional name, ✎ renames, ✕ removes the open one. Every PO row has a Package dropdown; or tick POs and press the key, or drag them onto a package in the sidebar. Click a PO to split it by work item. A work item whose lines are all in one package gets the package as its PKG (so Coding shows it); only a work item split between packages keeps it per line. Package allocation does not count as hand-coding.
2. **Rates & coding** – one package at a time: one row per work item with the rate range of all its POs (a dot per PO, green lowest, red highest, a line for the average, the spread in %), average and final (latest) rate, and DIV / MNL / Cost element typed on the same row. Click a row for every PO's rate as a card, cheapest first, % vs average. "Fill empty" puts DIV / MNL / Cost element on every work item shown that has it empty. Filters: All · Not coded · Spread ≥ 10%. The sidebar shows coded % per package.
3. **Review** – one table: each package with POs, work items, certified to date, this month, change vs last month, coding progress and rate checks (work items with spread ≥ 10%); click a row to open it; Export Excel and Save codes are here.

The Overview dashboard (More › Overview): KPIs, packages, certified per month, insights, top POs of the month.

Colours: neutral group rows with one thin accent bar per group / package (10 muted accents), red and green kept for status only.

### Depreciation switch (app)
The **Depreciation** tab shows the CJI3 depreciation per cost element × month (Opening, Sep-25 …). One click excludes all of it, or click a month to exclude / count that month; the Item switch excludes one cost element. What is excluded leaves the counted cost and shows on the Summary as "– Depreciation excluded by you", so the difference to CJI3 stays 0. No estimates are added for months the depreciation run was not done. The choice is saved with your codes.

### Expenses (dynamic list, Excel 365)
- **PKG list** (top of the sheet): type PKG code and name once (20 rows, yellow). Each PKG takes the colour of its row; totals per PKG (items, opening, previous, this month, to date, % of total, pending), `(no PKG yet)`, `Not in the list` (a PKG typed on a Coding/Data sheet but missing from the list – turns red) and the TOTAL = counted cost. The list carries over to next month with `--prev`.
- **Choices** (▼): PKG, Bucket, Lines (all / hand-coded / not fully coded / moved this month) and Sort (PKG › Bucket › Item, To date or This month largest first).
- **The list**: one dynamic formula (FILTER + SORTBY) that keeps itself in PKG › Bucket › Item order. Lines typed over on a Data sheet appear as `Hand-coded` rows under the PKG that was typed.
- Behind it the hidden `_Stack` sheet: one row per item (from the per Month sheets) plus one spill per bucket for the hand-coded lines (room for 1,000 item × PKG × MNL × code combinations each; Checks flags an overflow).
- Dynamic arrays are written by `src/dynarray.js` (cell metadata as Excel 365 stores it). Verification: LibreOffice 26.2 (`apt-get install -t noble-backports libreoffice-calc`) recalculates every formula, the dynamic lists included.

### HTML app (prototype)
`node tools/proto-app.js --cji3 … --mb52 … --zscprg01 … --zscsrv1 … [--prev last.xlsx] --out out/Cost_Register_App.html` writes the whole register as ONE offline HTML file (tabs: Summary, Coding, Per Month, Lines, Expenses, Subcontractor, Checks; cut date and VAT switch live; codes saved in the browser, Save/Import codes; Export Excel = a light formatted report of values). The exported Excel can be given back to the register build as `--prev` (Coding sheets + "Line overrides").

### Version
The Tool carries a version (v01, v02 …) from the `VERSION` file: in its file name (`out/Cost_Register_Tool_v01.html`), next to the title, in the Excel export note and in saved codes files. Each new release bumps the number.

### The tool (no Node needed each month)
`node tools/build-app.js` writes ONE offline page, `out/Cost_Register_Tool_v01.html` (version from `VERSION`), (≈1.3 MB) with the engine inside. Open it, drop CJI3 (+ MB52, ZSCPRG01, ZSCSRV1 and last month's Excel or codes .json) and press Build – about 20–30 s in the browser; the build is kept in the browser until the next one. The same engine runs in Node (`src/prepare.js`, `src/appdata.js`), and the browser build is checked to give identical data.
Excel loop: Export Excel → edit codes on the Coding sheets (per item) or on the Lines sheet (per line) → Import codes into the app, or give that Excel as "last report" to the next build (the app or `bin/register.js --prev`).

### Several files, any names
Drop all downloads into the tool at once: each file is recognised by its columns (`src/sniff.js`), not its name. Several CJI3 files (split by period and/or overlapping downloads) are merged on Document | Posting row | Fiscal year – a line in two files counts once; if its amount differs, the file with the later postings wins and the line is listed on Checks. Several ZSCPRG01 (by certificate line), ZSCSRV1 and MB52/ME2N files merge the same way. Command line: repeat the flag (`--cji3 a.xlsx --cji3 b.xlsx`).
Certificate documents whose CJI3 lines fall in more than one month get one adjustment row per month, so every month ties to CJI3.

## v03 – New-user fixes (from the first new-user walkthrough)
- **Start here** strip on the Code page: what PKG, MNL and Cost element mean, with examples; hide with ✕, bring back with **?** in the top bar. ⓘ on the code headers gives the same meaning on hover. The PKG list shows each code with its name.
- The automatic indirect fill no longer shows as an unsaved change (it is redone at every build).
- Footer: **Client deductions** shown, so CJI3 − To date is explained; CJI3, To date and Difference say how they tie on hover.
- Check › Coding progress reads "0 … out of 37 items".
- Adjust in plain words: add to the cost / take out, Added / Not added, "Add none" / "Add all to <month>".
- Save and Export Excel keep their words on a laptop screen.
- Start page: each file shows its project (from WBS or Plant); a file of another project than the CJI3 is shown in red with a warning.

## v04 – Tabs: Dashboard first, Lines next to Coding
- Tabs: **1 Dashboard** (Summary, Cost drivers) · **2 Code** · 3 Subcontractor · 4 Adjust · 5 Check · **6 Reports** (PKG summary, Per Month, By PKG, GL, WBS). The Tool opens on the Dashboard – it does not depend on coding.
- **Code** has one switch for the bucket: **Coding | Lines (CJI3) | Rate analysis** (Rate analysis on Material). Lines shows the bucket's CJI3 transactions (name, document header text, WBS, PO …) one click from coding; the bucket list stays on the left, with "All buckets" on top to search any document.
- The top bar stays on one line from 1366 to 1920 px wide.

## v05 – Opening balance marked on the lines
- CJI3 lines of doc type **UE** with header text "OB…" or posted on the first CJI3 day (the project's opening balance) carry a yellow **OB** tag and a light-yellow row in Code › Lines and in the item's lines drawer; the item heading on Lines shows its OB amount. Filter the Type column on "UE · OB" to see them all.
- Allocation is unchanged: each OB line stays in its cost element's bucket (Main Material OB stays in Other direct cost until it is reallocated in SAP). SUTH: 54 lines, 39.3M.

## v06 – Auto-save to a codes file
- The first time you code an item, the Tool asks once: **Save your codes automatically?** Choose a file (e.g. `SUTH_codes.json`, next to the Tool) and every change then saves itself to it – no Save button. Chrome / Edge.
- The footer shows the save status: red **Not saved to a file · Choose file** (codes only in this browser), green **Auto-saved · SUTH_codes.json · 10:42**, amber **Click to keep auto-saving** (after reopening the Tool, the browser asks for one click).
- The file is linked per project: when the Tool opens (e.g. next month's build) and the file holds newer codes than the browser, they are loaded from it.
- **Later** keeps today's way (codes in this browser; Save / Export as before); the question comes back the next session. Save and Import still work, e.g. to send codes to someone.

## v07 – Coding speed
- **⚡ Next to code** (Code, every bucket): only the items still to code, biggest to-date amount first, with their rank and cumulative share; the keys strip shows how far the bucket is coded and how many items bring it to **80%** of the cost. A coded item leaves the list. **All items** is the normal view.
- **Suggested codes** (grey, in the empty PKG / cost element boxes): taken from coded items of the same **material group** (Material) or the same **PO** – first the same service on that PO (Subcontractor). Codes kept from **last month** count too; the reason is shown ("like … – same material group M030201 · last month"). One row at a time – there is no accept-all.
- **Keys**: **Enter** accepts the suggestion (PKG + cost element) or saves and goes down; **Tab** next box; **Ctrl+D** same as the row above; **Esc** skip.

## v08 – Second project (SBAY)
- Rules: **Cash consultancy** and **Security expenses** (cost elements first seen on SBAY) are G&A › Site running costs; the "Other labour / payroll" rule now matches any project's WBS …IN-02-1, not only SUTH.
- Tests: `npm test` runs both projects – SUTH (91 checks) and SBAY (87 checks, masked copy in test/data-sbay).

## v09 – Direct groups in the PKG summary
- The Direct section starts with four empty groups: **Civil, Architecture, MEP, Infrastructure**. Put your PKGs in them in Reports › PKG summary › Codes & groups (rename, add or remove groups there). A register that already has its own groups keeps them.

## v10 – Codes in one spelling
- PKG, MNL, cost element and DIV are kept in **capitals** (sf-02 → SF-02); a known code keeps its own spelling (Indirect, Sponsorship). Codes typed in lowercase before are fixed once when the register opens – logged in Changes, Ctrl+Z to undo. Same for the codes in Codes & groups.
- Next to code always opens biggest first: a column sort chosen in All items no longer carries over.

## v11 – Lines (CJI3) as a flat list, like Coding
- Code › Lines (CJI3): one row per CJI3 line, no item rows. Columns: **Posting date, Period**, then the Coding columns of the bucket (e.g. Group, Material, Description, Name (CJI3), Unit), **PKG, MNL, Cost element, Status, Include**, then Qty, Amount and every line detail (line text, PO, subcontractor, source, WBS element, document header text, offsetting account, document, type, cost element, cost element name).
- Status is the line's own (its codes or its item's); the All / Not coded / Coded chips filter lines by it. A code typed on a line codes that line only, as before.

## v12
- Code › Lines (CJI3): **WBS element** and **Document header text** right after Name (CJI3).

## v13
- Code › Lines (CJI3) follows the group / family chosen in the side list, like Coding.

## v14 – coding first
- The Tool opens on **Coding › To code**, the largest cost first. The top bar shows one number: how much of the cost is coded and how many items are left.
- Dashboard, Subcontractor, Adjust, Check and Reports sit in one menu at the top right (with VAT, Import, Save and New build). A yellow **Back to coding** button shows on every other page.
- The side list is a work list: each bucket shows what is left to code; finished buckets move to "Done". Groups show how many items are left.
- One switch **To code · Coded · All** replaces the status chips and "Next to code"; **Items · Lines (CJI3)** stays next to it.
- Bigger code boxes; a pick list under PKG and Cost element shows your codes with their names (type to filter, ↑ ↓ and Enter, or click).
- Rate analysis moved to Dashboard; Rules moved to Check. Auto-save status moved to the top bar; the footer only shows what is not zero.

## v15
- Excel export: the PKG summary sheet no longer makes Excel "repair" the file (two sheet settings were written in the wrong order by the Excel library; fixed at build, with a check).
- Pick list: with PKG = Indirect, the cost element list shows the whole template list, used or not. With no PKG on the row yet, it shows every cost element with its name and PKG; picking one fills both.

## v16 – navigation and Cost flow
- Dark top bar: logo, **project › page name**, and the **cut date** as a gold button.
- Side navigation with every page and its status in words. It hides to a strip of icons, opens under the mouse, and **pin** keeps it open. The one menu of v14 is gone; VAT, Import, Save and New build sit at the bottom of the navigation.
- The Tool opens on the **Dashboard**; "Code" is now **Coding** (it still opens on To code, largest cost first).
- New **Dashboard › Cost flow**: a Sankey of the actual cost, SAP bucket → Direct / Indirect → package or indirect group, with "Not coded yet" in red. To date or this month; packages or groups. Credits that cannot be drawn are listed under it, so it ties to the cost to date.

## v17 – Cost flow: breakdown layer and time
- A last layer breaks each package (and each indirect head) down by the SAP bucket its cost came from. **Breakdown: Hide · Main · All** hides it, labels the main parts, or labels every part.
- Any period, not only the cut date: **To date · This year · the cut month**, a From / To month, and ◀ ▶ to move the period one month. The line under the chart ties the bands and the credits to the cost of that period.

## The Tool as a browser app (own window and icon)
`npm run build:site` writes `out/site/`: the same Tool page plus a manifest, an icon and an offline cache. Published at a web address (GitHub Pages, branch `gh-pages`), Edge or Chrome can install it: **⋯ › Apps › Install this site as an app**. It then opens from its own icon, works offline, and picks up a new version by itself.
The published page is the empty Tool; the SAP files you drop are read on your PC and never uploaded.

## v19 – Expenses as its own page (v18 had it inside Coding)
- **Coding** has two tabs: **Items** and **SAP transaction lines** – the CJI3 lines of the bucket you are coding, with the bucket's colour and the codes (code Material → Material's lines).
- **Expenses** is its own page in the navigation: every item of every bucket by month (or one bucket, from the side list). Bucket, PKG, MNL, Cost element, the item, then the months as Amount, Qty, Rate or all three; months, quarters or years. It is a report: the codes are shown, you code in Coding.
- (v20) Expenses opens on **Qty · Rate · Amount**, and takes the codes from the CJI3 lines: a line coded by hand (different from its item) makes its own row, marked ✎. So each row is an item + its codes, as in the Expenses sheet of the full Excel.
- **Export to Excel** on the Expenses page gives this report only, as on screen, with a total row (amounts) and filters.

## v21 – Expenses as an analytical table
- One toolbar: **Table · Chart · Filter · Sort · Group · Export · Mass Edit**, with search; under it a line of chips that says what is grouped, filtered and sorted (✕ removes one, *Clear all* removes all), then Qty · Rate · Amount and **View**.
- Starts as a **flat list by month**; a border marks every month block. **View: Summary** gives Previous cumulative · Previous month · This month · Cumulative, Change and a trend.
- **Filter:** status, a From / To month range, months / quarters / years. **Sort:** sort by, then by. **Group:** by bucket, PKG, MNL or cost element, with group totals.
- **Mass Edit:** tick rows, type codes in the bar, Apply – the codes go on the CJI3 lines of those rows.
- **Chart:** the amount of every month, stacked by bucket, for the rows on screen.

## v22 – Expenses as three report pages
- The side list picks the page; fewer options on each. The v21 analytical toolbar (chips, group/sort dialogs, chart, mass edit) is gone.
- **1 Summary:** cumulative to the cut date, compact – buckets folded (or PKG › bucket). Item, PKG, MNL, Cost element, Qty cumulative, Previous cumulative, This month, Cumulative, Share.
- **2 Expenses per month:** every item with PKG, MNL, Cost element; Qty · Rate · Amount or Amount; months, quarters or years.
- **3 Indirect per month:** PKG = Indirect only, by indirect head › cost element, amount per month, To date and the average of the last 3 months.
- Every page takes the codes from the CJI3 lines: a hand-coded line is its own row (✎). Each page has its own Export.

## v23 – Subcontractor spread over the other pages; Expenses detail
- The Subcontractor section is gone from the navigation: **POs** is a tab in Coding (next to Items and SAP transaction lines, for the Subcontractor bucket); **Rates & coding** (the packages steps) is under Dashboard; **PO register** is in Reports with Export to Excel; **Bridge to CJI3** is in Check; the Overview is removed.
- Expenses: a **Material group / Type of works** column. **Expenses per month** groups like Summary (bucket › item or PKG › bucket › item, + / −); its Excel stays a flat list.
- **Indirect per month:** as before, plus **Avg per month** (all months to the cut) and a + on each cost element to show its items; an item opens its CJI3 lines.
- Excel of Summary and Indirect: the heads with their items below (outline levels), header frozen.
- The column filter no longer opens under the side navigation.

## v24
- On a report page (Expenses 1–3, PO register) the top-bar button reads **Export this report** and exports only that report; on every other page it is the full register Excel as before (Shift+click on a report page also gives the full register).

## v25 – Expenses › SAP CJI3 transactions
- A 4th Expenses page: **SAP CJI3 transactions** – every CJI3 line of every bucket, flat, with its bucket and codes (PKG, MNL, Cost element can be corrected here, line by line).
- Clicking an item on Summary, Expenses per month or Indirect per month opens this page with **only that item's lines that carry the row's codes** – the same amount as the row. The yellow chip says what is shown; ✕ shows every line again. The item window's "show lines" opens it too.
- Fixed: the number of CJI3 lines per item (and the hand-coded count) showed 0 – a code comment had swallowed the counting.

## v26
- App icon: the Alshorouk "Actual Cost Register" badge – the browser-tab icon of the Tool and the icon of the installed browser app (app/pwa/icon-192.png, icon-512.png).

## v27
- New icon (a register sheet with a gold coin) – the app / taskbar icon, the browser-tab icon and the logo at the top left of the Tool. "Cost Register vNN · by A. Atef" at the bottom of the side navigation.
- Report pages (Expenses 1–4, PO register) have a two-line toolbar: title, **− Collapse all / + Expand all**, grouping and a short note on the first line; search, status, Qty · Rate · Amount, Months · Quarters · Years, Columns, Fit and Export on the second. Nothing is hidden off the edge any more.
- A more polished Excel for every report: title and a line with project, cut date, row count; navy headers (period over its Qty / Rate / Amount, cut month in gold, code columns in gold); light borders; widths fitted to the content; Arabic text right-to-left; group rows shaded with + / − outline in Excel; navy total row; frozen header and first column; prints landscape on A3, fit to width, with the header on every page and page numbers.

## v28 – POs on Expenses per month
- Subcontractor rows are split **one row per PO**, with **PO** and **Subcontractor** columns and that PO's own qty, rate and amount; the repeated item columns are grey. On SUTH: subcontractor 630 → 1,381 rows (2,717 → 3,470 in all); the totals do not change. The Excel export follows the screen.
- Clicking an item on a PO row opens SAP CJI3 transactions with the lines of that item, those codes and that PO.

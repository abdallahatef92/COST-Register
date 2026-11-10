# The Tool's screen code

`tools/build-app.js` builds the Tool from:

- `register.html`: the page skeleton (top bar, footer, start page, placeholders).
- `css/register.css`: every style.
- `js/NN-*.js`: the screen code, joined **in file-name order** into one script.
- `engine-entry.js` + `../src/`: the engine that reads the SAP files (bundled with esbuild).

Parts `01`–`23` sit inside one function, `boot(DATA)` (opened in `00`, closed in `23`), so they share its variables. Treat them as **chapters of one file**, not separate modules. Keep the order, and keep a function in the part where it's used first.

| Part | What it holds |
|---|---|
| 00-boot-open | `boot(DATA)` starts |
| 01-data-helpers | data arrays, number formats, small helpers |
| 02-state-undo | state (cut, VAT, codes, overrides), change / undo / redo, saving in the browser |
| 03-autosave | auto-save to the chosen codes file |
| 04-compute | the engine on screen: everything from the lines + codes + cut date |
| 05-tabs-side-status | the top bar (progress, menu), the work list at the side, the footer, render() |
| 06-colors | bucket colours |
| 07-cost-drivers | Dashboard › Cost drivers |
| 08-pkg-summary | Reports › PKG summary + Codes & groups |
| 09-summary | Dashboard › Summary |
| 10-checks | Check › All checks |
| 11-changes-log | Check › Changes |
| 12-indirect-presets | SAP GL → indirect code |
| 13-rules | Code › Rules |
| 14-table-pages | what each table page shows: Coding, Lines, Per Month, GL, WBS, Adjust … |
| 15-sub-overview | Subcontractor › Overview |
| 16-sub-packages | Subcontractor › Packages |
| 17-material-rates | Code › Rate analysis |
| 18-sub-packages-assign | putting POs / work items into packages |
| 19-table-render | the table itself: widths, sorting, groups, tick boxes, events, bulk coding |
| 20-code-picker | the pick list under a PKG / cost element box |
| 20-filter-popup | the Excel-like filter |
| 21-drawer-drilldown | item drawer, double-click drill-down |
| 22-topbar-import-export | Import, Save, Export Excel |
| 23-boot-start | what happens when the register opens; `boot()` ends |
| 24-start-page | the start page: drop SAP files, build |

Check every change with `npm test`.

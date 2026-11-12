# Release checks

```
npm test            # everything, about 2 minutes
npm run test:quick  # skips building from the start page
node test/run.js --update   # only after the owner agrees a changed figure is right
```

**What it checks**
1. Every SAP file is recognised by its content, with its project (the MB52 here is another project on purpose).
2. Engine: CJI3 total, lines, items per bucket – nothing unclassified, no duplicate keys.
3. The Tool builds with its version number.
4. The register opens on the Dashboard; difference to CJI3 = 0; to date, client deductions and to date per bucket as expected; nothing "unsaved" on opening.
5. Indirect presets: the same items get the same codes; opening-balance lines (UE / OB).
6. Every page and every side-list entry opens with no JavaScript error; Check shows no line to look at.
7. Coding an item, Ctrl+Z, Code › Lines, Rate analysis.
8. Save codes → a fresh browser → Import brings them back.
9. Excel export opens and has its main sheets.
10. The empty Tool: drop the files, get the wrong-project warning, build, difference 0.

`expected.json` holds the figures from the real SUTH files (30 Sep 2026). A failing figure means a change moved money between buckets or items – even when the difference to CJI3 is still 0.

**Data** – `test/data` is a MASKED copy of the SUTH downloads, made with `tools/mask-sap.js`: people, suppliers, users, header / PO texts, flat addresses, company and project names are replaced; every code, number, date and amount is kept, so the register gives exactly the same figures as the real files. Never put real SAP files in this repo – it is public.

## Faster runs
- `npm test` – the release check: builds the Tool once, then runs SUTH and SBAY **at the same time** (about 3 minutes; was about 6).
- `npm run test:quick` – everything except 9 Excel export and 10 start-page build (about 2 minutes). For checking while working.
- `npm run test:only -- 7e` – only the named sections (1–4 always run, they open the register), e.g. `-- 7e,8`. About 1 minute.
- The engine result (reading the SAP files, ~30 s per project) is kept in `out/test/<set>/engine-cache.json` and reused until a test data file or a file in `src/` changes.
- Only the full `npm test` counts for a release.

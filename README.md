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

### Expenses (dynamic list, Excel 365)
- **PKG list** (top of the sheet): type PKG code and name once (20 rows, yellow). Each PKG takes the colour of its row; totals per PKG (items, opening, previous, this month, to date, % of total, pending), `(no PKG yet)`, `Not in the list` (a PKG typed on a Coding/Data sheet but missing from the list – turns red) and the TOTAL = counted cost. The list carries over to next month with `--prev`.
- **Choices** (▼): PKG, Bucket, Lines (all / hand-coded / not fully coded / moved this month) and Sort (PKG › Bucket › Item, To date or This month largest first).
- **The list**: one dynamic formula (FILTER + SORTBY) that keeps itself in PKG › Bucket › Item order. Lines typed over on a Data sheet appear as `Hand-coded` rows under the PKG that was typed.
- Behind it the hidden `_Stack` sheet: one row per item (from the per Month sheets) plus one spill per bucket for the hand-coded lines (room for 1,000 item × PKG × MNL × code combinations each; Checks flags an overflow).
- Dynamic arrays are written by `src/dynarray.js` (cell metadata as Excel 365 stores it). Verification: LibreOffice 26.2 (`apt-get install -t noble-backports libreoffice-calc`) recalculates every formula, the dynamic lists included.

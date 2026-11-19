# Budget and earned value – plan (agreed, not built yet)

The owner's monthly **cost report** workbook: *Direct plan* (BOQ items), *Cost analysis* (each BOQ item broken into resources, coded PKG / MNL / cost element) and one sheet per PKG (S03, S04 …) with BAC, BCWP, the actuals, additional cost / accruals and a forecast rate per resource → EAC.

The register already has the actual side (ACWP) by PKG / MNL / cost element, tied to CJI3. This adds the budget side.

## Decisions (owner, 19 Nov 2026)
1. **Budget source:** read the owner's existing cost report Excel (Direct plan + Cost analysis); read it again when the budget is revised.
2. **Progress:** quantity done per BOQ item → BCWP = qty done × budget rate.
3. **Forecast rate:** per resource inside each PKG, as in the S-sheets → ETC → EAC.
4. **First project:** SBAY.

## Waiting for
- A real cost report workbook from the owner (Direct plan, Cost analysis, one or two PKG sheets). It stays out of the public repo; only a masked copy may be used for tests.

## Then
- Map its sheets and formulas exactly, show a PNG mock-up of the PKG page (BAC · BCWP · ACWP · CPI · forecast rate → ETC · EAC · variance) and the monthly progress entry, and ask before building.

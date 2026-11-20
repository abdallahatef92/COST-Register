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

## The workbook (SBAY cost report rev03), mapped 19 Nov 2026
- **Direct plan**: BOQ item code (M, e.g. R-SBAY-01-STR-03-1-01), PKG (J = STR-03, O = S03), SAP code (K), unit (S), take-off per building type × phase B1 (AX…BJ), selling rate (BZ), **EV qty per building type** (DF…DR), provision (EI), budget rate from Cost Analysis (FA), BAC (FD), EV (FH).
- **Cost Analysis**: level-3 row = BOQ item, level-4 rows = its resources: CSI code = PKG (D), EXP = M / S (E), cost element code (F, e.g. M-2710), unit (N), usage (O), waste (P), rates (R…V), budget rate (W), take-off (AA), BAC (AB = rate × take-off), invoiced qty (AG), EV (AH), resource qty (AI / AJ).
- **PKG sheets** (EARTHWORK, Reinforced Concrete …, A1 = CSI code): by type (M / S / Labor / Fluctuation / A/O), then per cost element: Budget (rate, take-off, invoiced, BAC) · EV (resource qty, EV) · Actuals (expenses qty / amount + addition-omission + provision) · CV = EV − actuals · remaining qty × forecast rate (defaults to the budget rate) = ETC · EAC = actuals + ETC · VAC = BAC − EAC · losses.
- **expenses**: the actuals typed from MAT LOG / sc log, coded Main code (STR-03) + cost element – the register replaces it (CJI3, coded).

## Decisions (19 Nov 2026, second round)
1. PKG codes and names: read from Cost Analysis.
2. Cost elements for coding = the Cost Analysis resources of the PKG; actuals that do not land on a budget resource show on their own row ("not on a budget resource").
3. Progress: EV quantity per BOQ item per building type, as in the Direct plan.
4. Provision and addition / omission: entered in the tool, per PKG and cost element (qty × rate).

## Decisions (20 Nov 2026, third round)
- PKG page: resources grouped Material / Subcontractor, each with a sum, then a TOTAL row for the PKG.
- ~~Assign cost without a budget resource on the PKG page~~ – replaced (20 Nov, owner): the coding is done in Coding (PKG + MNL + cost element). The budget pages only report. A mismatch is only in the cost element: the line has its PKG and MNL but its cost element is not a budget resource of the PKG. It then stays in its MNL group (MAT → Material, SUB → Subcontractor, LAB → Labor, EQU / OTHER / ACC → their own group) on a red row "not on budget", listing the cost elements, counted in AC / EAC / VAC, with a link to fix the cost element in Coding.
- Groups on the PKG page follow the MNL: MAT, SUB, LAB, then EQU / OTHER / ACC (no budget resources).
- AC by type follows the resource (cost coded to M-2710 counts as Material), so the by-type and by-resource tables always agree.
- Scope: Direct PKGs first; Indirect (Indirect Plan) in a later step.
- One release: read the budget (Direct plan + Cost Analysis) + PKG pages + Progress (per BOQ item per building type) + provision / add-omit entry + Summary + Excel export (a tab per PKG like the S-sheets, and a Summary tab like the report's).
- The cost report workbook has a second table on each PKG sheet: BOQ item × resource ("Combined Code") – not part of the PKG totals.

## PKG page layout (20 Nov 2026, owner – replaces the red "not on budget" rows)
- Every line coded to the PKG sits in its MNL group as a normal row – also when its cost element is not a budget resource (small "no budget" tag, BAC 0). It takes a provision and a forecast like any other.
- Columns: Cost element · Resource · Unit | Budget: rate · take-off qty · BAC | Earned value: EV qty · EV | Actual (register): qty · rate · amount | Add / omit: qty · rate · amount | Provision: qty · rate · amount | Total cost: AC (= actual + add/omit + provision) · CV | Forecast: remaining qty · forecast rate · ETC · **BAC** · EAC · VAC.
- Typed (yellow): add/omit qty and rate, provision qty and rate, forecast rate; remaining qty too on a no-budget line.
- Each group has its sum; TOTAL for the PKG at the end.
- **All columns of the PKG sheet, B … AO, in its order and groups** (owner, 20 Nov): Cost element code · cost element · unit · resource unit | Budget: budget rate · take-off qty · invoiced qty · remaining qty · total budget | Earned Value: take-off resource qty · EV resource qty · remaining resource qty · resource UR · EV fluctuation · EV total amount · variance EV qty – expenses | Actuals (expenses = register): qty · UR · amount | Add / omission: qty · UR · amount | Provision: qty · UR · amount | Current cost variance: grand total · cost variance | Forecasting: remaining resource qty · forecasting rate · ETC · EAC · BAC · VAC | Losses: take-off and EV qty after measurement adjustment · budget losses (mat.) · EV losses (mat.) · budget losses % · actual losses · actual losses %. Same formulas as the sheet.

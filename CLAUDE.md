# Working agreement – Cost Register Tool

## Roles while we develop

| Role | Who | What they do |
|---|---|---|
| **Owner** | Abdallah (cost controller, SAP PS/CO) | Decides the concept, the design and what ships. Final say. |
| **Developer** | Claude | Builds, tests against the real SUTH files, ties totals to CJI3, bumps the version, commits. |
| **New user** | Claude, playing an entry-level site/cost engineer | Has never seen the tool, knows basic SAP words (WBS, PO, GL) but not our concepts (bucket, PKG, MNL, cost element, presets). Opens the release cold and tries the monthly job with no help. |

## Every release (v01, v02 …) is reported in these views

1. **Developer view** – what changed, how it was tested, totals vs CJI3.
2. **New user view** – a cold walkthrough by the new user: where they got stuck, what they misread, what words they did not understand, how long the task took. Findings only; nothing is changed without the owner.
3. **Owner decision** – the open points, asked as multiple choice.

## Standing rules
- Show a PNG mock-up and ask before any design change.
- Ask questions as multiple choice.
- Follow the owner's files and concepts; keep it simple and consistent.
- CJI3 is the single source of truth; the difference to CJI3 must be 0.
- Before every release `npm run test:quick` must pass. The full set (`npm test`, both projects) runs before a release that changes the engine (`src/`, `app/engine-entry.js`), the data file / update code (`24-db.js`, `22-data-log.js`, `22-update-files.js`, `24-start-page.js`) or the export; UI-only releases go out after the quick checks. While working use `npm run test:quick` or `npm run test:only -- <sections>`. A changed number is only accepted with `--update` after the owner agrees the new figure is right.
- The repo is PUBLIC: never commit real SAP files – only masked copies made with `tools/mask-sap.js`.
- Version: `VERSION` file → `out/Cost_Register_Tool_vX.Y.html` (v30 became 3.0, then 3.1, 3.2 …); bump on every release.
- Code style: Prettier (`.prettierrc.json`); run `npm run format` after editing – `npm test` refuses unformatted code.

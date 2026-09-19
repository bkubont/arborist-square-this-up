# Archived: `Important-forms` branch unique work

Preserved after merging `main` (PR #1, Phases 0–5) into `Important-forms`.

## Why archived

`Important-forms` used a generic `Document` entity plus separate Estimate/Money/Schedule/Settings routes.  
Phases 0–5 on `main` already ship Estimate / Work Order / Change Order / Invoice as first-class job documents (`JobDocuments`, editors, catalog, e-sign, `CompanyProfile`).

Merging both implementations into the live app would reintroduce conflicting models. Shared files were resolved **in favor of `main`**. These files are kept here so nothing from the branch is discarded.

## Contents

| File | Original purpose |
|------|------------------|
| `DocumentForm.jsx` | Full-page estimate/invoice editor |
| `Estimates.jsx` | Document list / tabs |
| `Money.jsx` | Money overview page |
| `Schedule.jsx` | Schedule page |
| `Settings.jsx` | User business-profile settings |
| `BusinessProfileFields.jsx` | Profile form fields |
| `EstimatePanel.jsx` | Job-detail estimate panel |
| `profile.js` | Profile completeness helpers |

## Re-use

Do not import these into the live app without adapting them to the Phase 0–5 entity model (`Estimate`, `WorkOrder`, `ChangeOrder`, `Invoice`, `CompanyProfile`). Prefer extending the Phase 0–5 UI instead of restoring the generic `Document` path.

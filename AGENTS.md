# AGENTS.md

This is the **arborist edition** of Square This Up — a standalone React/Vite + Express job tracker forked from the contractor product for tree-service businesses. Production target: **https://arborist.squarethisup.com**. Read README.md and DEPLOYMENT.md for setup and Hostinger steps.

- Keep the contractor repo (`bkubont/Square-this-up`) untouched; this repo is a separate product.
- Keep changes focused and preserve the existing UI conventions.
- Frontend: src/. API client: src/api/client.js. Backend: server/. Shared presets: shared/arboristServicePresets.js.
- Arborist v1 extras: `TreeInventory` entity (per job), CompanyProfile `service_presets`, arborist work types and demo seed.
- Production requires MySQL; local development uses persistent SQLite.
- Every record, relationship and file operation must enforce the authenticated account's ownership server-side. Public registration remains invitation-only.
- Keep secrets, account exports, local databases and invitation links out of git.
- Run npm test, npm run lint, npm run typecheck and npm run build for relevant changes.
- Do not purchase domains, change live DNS, or create Hostinger websites/databases without explicit user confirmation.
- Preserve base44/entities as source migration references. Do not reintroduce Base44 SDK or runtime dependencies.
- Use npm run dev locally and npm start for the built production app.

# Store — Persian-first e-commerce on Cloudflare

This repository is intended for the Store Cloudflare Workers + D1 project.

## Source archive
The initial project source should be uploaded from the provided `store-cloudflare.zip` archive. Extract it before uploading so the repository root contains `package.json`, `wrangler.jsonc`, `src/`, `public/`, `migrations/`, `tests/`, and `.github/workflows/deploy.yml`.

## Deployment prerequisites
- Cloudflare D1 database named `store-db`
- GitHub Actions secrets:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `D1_DATABASE_ID`

Do not commit credentials, `.dev.vars`, or real secret values.

## CI/CD
The workflow is designed to run unit tests and, on pushes to `main`, apply D1 migrations and deploy the Worker. It has not yet been verified in GitHub Actions.

## Important
Keep this repository private until you intentionally choose to open-source the code.

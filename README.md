# Fabric Studio

This repository contains the React + TypeScript web application that powers Harper Fabric at https://fabric.harper.fast and Harper Studio locally.

It is also the source for the bundled “Local Studio” UI that ships with the `harperdb` Node package. If you enable `localStudio` in your Harper config YAML, this app is served directly from your local Harper instance.

- Live site: https://fabric.harper.fast
- Tech stack: React, Vite, TypeScript, Tailwind CSS, TanStack Router/Query/Table
- Package manager: pnpm (see package.json `packageManager`)


## Quick start (develop this repo)

Prerequisites:
- Node.js (see .nvmrc)
- pnpm (the version in `package.json#packageManager` is recommended)

Install and run the dev server:

```bash
pnpm install
pnpm dev
# or use the Local Studio dev mode (see below)
pnpm dev:local
```

Builds are emitted to `web/` (see `vite.config.ts`). The `web/` directory is build output; don’t edit it by hand.

Common scripts:
- `pnpm dev` — start Vite dev server
- `pnpm dev:local` — start in Local Studio mode
- `pnpm build` — type-check then build for production
- `pnpm build:dev|stage|prod|local` — build for a specific mode
- `pnpm preview` — serve the built `web/`
- `pnpm test` / `pnpm test:watch` — run unit tests (Vitest)
- `pnpm lint` — run ESLint

Tip: prefer using the Makefile shortcuts in `Makefile` if you like `make` (e.g. `make dev`, `make build-prod`).


## Using this app via Harper (Local Studio)

If you would like to run the Studio UI locally via Harper itself, install and start Harper with Local Studio enabled. At runtime, Harper will serve the compiled UI from this repository.

Open your harperdb-config.yaml and enable localStudio:

```yaml
localStudio:
	enabled: true
```

Then visit http://localhost:9925 (or wherever you've set your operations port) to access the Local Studio. The default dev URL used by this repo is `http://localhost:9925` (see `VITE_LOCAL_STUDIO_DEV_URL`).


## Environments and configuration

This project uses Vite environment files and modes. You can pass `--mode <name>` to Vite to pick a `.env.<name>` file. Some keys you may encounter:

- `VITE_LOCAL_STUDIO` — whether to run in “Local Studio” mode
- `VITE_CENTRAL_MANAGER_API_URL` — base URL for API calls (e.g. https://fabric.harper.fast)
- `VITE_LOCAL_STUDIO_DEV_URL` — local Harper URL for Local Studio dev (default http://localhost:9925)
- `VITE_PUBLIC_STRIPE_KEY` — Stripe public key used in billing flows
- `VITE_ENV_NAME` — environment label (dev/stage/prod)

Example `.env.local` for local development:

```
VITE_LOCAL_STUDIO=true
VITE_CENTRAL_MANAGER_API_URL="http://localhost:9925"
VITE_LOCAL_STUDIO_DEV_URL=http://localhost:9925
VITE_ENV_NAME=dev
```

Notes:
- A production example is in `.env.prod`.
- Building for a specific environment uses the matching mode: `pnpm build:dev`, `pnpm build:stage`, or `pnpm build:prod`.


## OpenAPI SDK generation

This repository can generate TypeScript definitions from the Central Manager OpenAPI schema.

- `pnpm update-sdk` — fetch the OpenAPI JSON and generate `src/integrations/api/api.gen.d.ts`

Environment variables required (typically in `.env.local` when running the script locally):

```
VITE_CENTRAL_MANAGER_API_URL=<https://your-api-host>
HDB_ADMIN_USERNAME_FOR_OPENAPI=<username>
HDB_ADMIN_PASSWORD_FOR_OPENAPI=<password>
```

What the script does:
1) Downloads `${VITE_CENTRAL_MANAGER_API_URL}/openapi` into `./dist/central-manager.json` using the admin credentials
2) Runs `openapi-typescript` to generate `src/integrations/api/api.gen.d.ts`


## Linting, formatting, and type-checking

- ESLint: configured in `eslint.config.js` with TypeScript, React Hooks, and React Refresh plugins
- TypeScript: strict project references via `tsconfig.json` and `tsconfig.app.json`
- Tailwind CSS: configured via `@tailwindcss/vite`; styles are colocated with components

Run locally:
- `pnpm lint`
- `pnpm exec eslint . --fix` to auto-fix
- `pnpm exec tsc -b` to type-check


## Testing

- Test runner: Vitest (see `vitest.config.ts`)
- Run once: `pnpm test`
- Watch mode: `pnpm test:watch`


## Commit conventions and release

This repo enforces Conventional Commits via commitlint. Please format your commit messages like:

```
feat: add database browser filters
fix: normalize column widths in table view
chore(ci): update workflow names
```

- Commit linting: `pnpm commitlint --edit`
- Husky: run `pnpm prepare` after install to set up git hooks (if hooks are present in the repo)
- Semantic Release: configured to release from the `stage` branch using conventional commits

Useful commit types include: feat, fix, perf, refactor, chore, docs, style, test, build, ci, revert.


## Contributing

Please see .github/CONTRIBUTING.MD for detailed guidelines, including how to run checks locally and how to structure your pull requests.


## Troubleshooting

- Dev server won’t start: ensure Node 20+ and pnpm installed; remove `node_modules` and reinstall.
- API calls failing in dev: verify `VITE_CENTRAL_MANAGER_API_URL` and any required auth are correct for your environment/mode.
- Local Studio not showing: ensure your Harper process has `localStudio: { enabled: true }` and is listening on the port you expect (default 9925).


## License

This project is proprietary to Harper. If you’re unsure about usage or licensing, please contact the maintainers.

# Contributing to Fabric Studio

Thank you for your interest in contributing! This document explains how to set up your environment, make changes safely, and submit high‑quality pull requests.


## Prerequisites

- Node.js (see .nvmrc file)
- pnpm (use the version pinned in `package.json#packageManager`)
- Git

After cloning, install dependencies and (optionally) set up git hooks:

```bash
pnpm install
pnpm prepare   # installs Husky if hooks are present
```


## Development workflow

- Start the dev server: `pnpm dev`
- Start in Local Studio mode: `pnpm dev:local`
- Run tests: `pnpm test` or `pnpm test:watch`
- Lint and type-check: `pnpm lint` and `pnpm exec tsc -b`
- Build: `pnpm build` (or `pnpm build:dev|stage|prod|local`)

Build output goes to `web/` and should not be edited directly.


## Environment configuration

We use Vite modes and `.env.*` files. You can `cp .env.local.example .env.local` to get started fast.

Some commonly used variables:

- `VITE_LOCAL_STUDIO` — enable UI behaviors for Local Studio
- `VITE_CENTRAL_MANAGER_API_URL` — API base URL
- `VITE_LOCAL_STUDIO_DEV_URL` — local Harper URL (default `http://localhost:9925`)
- `VITE_PUBLIC_STRIPE_KEY` — Stripe public key
- `VITE_ENV_NAME` — environment label (dev/stage/prod)

See `.env.prod` for a production example. For local development, create `.env.local` based on `.env.local.example`.


## Commit conventions

We use Conventional Commits and commitlint to keep history clean and to power semantic-release.

Examples:

```
feat: add database browser filters
fix: normalize column widths in table view
chore(ci): update workflow names
```

- Lint your commit: `pnpm commitlint --edit`
- If you want a commit-msg hook locally, you can add one (optional):
  ```bash
  # if a .husky directory is present in your clone
  npx husky add .husky/commit-msg 'pnpm commitlint --edit "$1"'
  ```

Useful types include: feat, fix, perf, refactor, chore, docs, style, test, build, ci, revert.


## Testing

- Framework: Vitest (see `vitest.config.ts`)
- Run once: `pnpm test`
- Watch mode: `pnpm test:watch`

Where practical, add or update unit tests for your changes.


## Linting and style

- ESLint is configured in `eslint.config.js` with TypeScript, React Hooks, and React Refresh plugins.
- Run: `pnpm lint`
- Auto-fix: `pnpm exec eslint . --fix`
- Type-check: `pnpm exec tsc -b`

We use Tailwind CSS; prefer utility classes and shared components for consistency.


## Generating the API types (SDK)

If your change depends on updated Central Manager API types:

```bash
# requires env: VITE_CENTRAL_MANAGER_API_URL, HDB_ADMIN_USERNAME_FOR_OPENAPI, HDB_ADMIN_PASSWORD_FOR_OPENAPI
pnpm update-sdk
```

This fetches the OpenAPI spec into `dist/central-manager.json` and generates `src/integrations/api/api.gen.d.ts`.


## Branching and pull requests

- Create feature branches from the main development branch.
- Keep PRs focused and reasonably small.
- Ensure `pnpm test` and `pnpm lint` pass before requesting review.
- Include screenshots or short videos for UI changes when helpful.
- Use descriptive PR titles that align with Conventional Commits when possible.

Releases are automated from the `stage` branch via semantic-release.


## Code review guidelines

- Prefer clear, readable code over “clever” code.
- Add comments where intent isn’t obvious.
- Avoid introducing unused dependencies.
- Keep changes backward compatible when feasible.


## Questions

If you’re unsure about anything, open a draft PR early or start a discussion. We’re happy to help get you unblocked quickly.

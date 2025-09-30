# Junie Guidelines for Harper Studio (Fabric UI)

This document guides Junie (the autonomous programmer) when working on this repository. It summarizes how to operate safely, efficiently, and consistently with this codebase.

Related docs and helpers:
- Project overview and scripts: README.md
- Contribution workflow: .github/CONTRIBUTING.MD
- Makefile shortcuts: Makefile


## Objectives
- Make the minimal necessary changes to satisfy the issue description.
- Keep maintainers informed using status updates (plans, progress, next steps).
- Prefer repository conventions and existing tooling over ad‑hoc solutions.


## Operating principles
- Prefer specialized tools over general ones when available.
- Do not mix special tools with shell commands in a single step.
- Keep edits tightly scoped; avoid unrelated refactors.
- If an issue involves an error, write a small script or steps to reproduce, then re‑run after fixes.
- Update the plan/status whenever significant progress or decisions occur.
- When in doubt or blocked, ask concise clarifying questions.


## Repo quick commands
Use pnpm scripts and Make targets. Examples:
- Dev: `pnpm dev` or `make dev`
- Local Studio dev: `pnpm dev:local` or `make dev-local`
- Build: `pnpm build` or `make build`
- Env-specific builds: `pnpm build:dev|stage|prod|local` or `make build-<mode>`
- Preview build: `pnpm preview` or `make preview`
- Lint: `pnpm lint` or `make lint`
- Lint (fix): `pnpm exec eslint . --fix` or `make lint-fix`
- Type-check: `pnpm exec tsc -b` or `make typecheck`
- Test: `pnpm test` or `make test`
- Update OpenAPI SDK: `pnpm update-sdk` or `make update-sdk`

See: package.json scripts and Makefile for the complete list.


## Environments and configuration
- Vite modes select .env files (e.g., `.env.local`, `.env.prod`).
- Common vars:
  - `VITE_LOCAL_STUDIO`
  - `VITE_CENTRAL_MANAGER_API_URL`
  - `VITE_LOCAL_STUDIO_DEV_URL`
  - `VITE_PUBLIC_STRIPE_KEY`
  - `VITE_ENV_NAME`
- For SDK generation, also require:
  - `HDB_ADMIN_USERNAME_FOR_OPENAPI`
  - `HDB_ADMIN_PASSWORD_FOR_OPENAPI`

See examples in README.md and .env.prod.


## Coding standards
- Language: TypeScript + React 19; Router/Query/Table via TanStack; Tailwind CSS 4.
- Linting: ESLint configured in `eslint.config.js`.
- Type-checking: `tsconfig.json`, `tsconfig.app.json`.
- Testing: Vitest (see `vitest.config.ts`).
- UI styles: Prefer Tailwind utilities and shared components.


## Do and Don’t
Do:
- Keep changes minimal and focused on the issue.
- Add/adjust tests when feasible for behavior changes.
- Run `pnpm lint`, `pnpm test`, and `pnpm exec tsc -b` before concluding.
- Use `update-sdk` only if API types are part of the change.

Don’t:
- Edit generated or build output (e.g., `web/`, `dist/`, `src/lib/api.gen.d.ts`).
- Introduce unused dependencies.
- Commit large unrelated refactors.


## Commit conventions and PRs
- Use Conventional Commits (enforced by commitlint). Examples:
  - `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`, `refactor: ...`
- Keep PRs small and descriptive; include screenshots for notable UI changes.
- Releases are automated from the `stage` branch via semantic-release.


## OpenAPI SDK generation
If your work depends on updated API types:
1. Ensure env vars are set (see above).
2. Run `pnpm update-sdk`.
3. Commit both `dist/central-manager.json` (if intended to vendor) and `src/lib/api.gen.d.ts` only when necessary.


## Issue-type checklists
- Docs-only change:
  - [ ] Update markdown files.
  - [ ] Run `pnpm lint` for markdown lint if applicable (or ensure formatting is sane).
  - [ ] No runtime code changes.

- UI/logic change:
  - [ ] Reproduce or describe behavior.
  - [ ] Implement minimal fix.
  - [ ] Add/adjust tests where practical.
  - [ ] `pnpm lint && pnpm exec tsc -b && pnpm test`.

- API-dependent change:
  - [ ] Update SDK (`pnpm update-sdk`) if needed.
  - [ ] Verify type changes compile.
  - [ ] Update affected code paths and tests.


## References
- README.md — project overview, scripts, envs, troubleshooting
- .github/CONTRIBUTING.MD — contribution workflow and standards
- Makefile — convenience Make targets

Following these guidelines will help maintain velocity while preserving stability and consistency across the project.

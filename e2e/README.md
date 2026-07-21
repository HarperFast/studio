# studio integration tests

Playwright end-to-end tests that drive the real studio UI to catch regressions.

This is a **standalone project** — it is deliberately _not_ part of the app's pnpm
workspace, so its dependencies and browser downloads stay out of the app build. It
holds only the narrow, disposable credentials it needs, never the app's `.env.local`.

## The two lanes

This harness is designed around one rule: **never run untrusted PR code in the same
context that holds real credentials, email, and network egress.**

|           | **Trusted lane** (daily + merge-to-`stage`) | **PR lane** (allowlisted authors)      |
| --------- | ------------------------------------------- | -------------------------------------- |
| Target    | Deployed dev app (`PLAYWRIGHT_BASE_URL`)    | A sandboxed build of the PR            |
| LLM role  | Triages failures only                       | Reads diff, adapts/adds tests          |
| Creds     | Disposable test account                     | Burnable throwaway; **no live email**  |
| Isolation | Can run on host                             | Container + egress allowlist           |
| Output    | Failure → issue/PR you review               | Proposed test diffs → PR **you** merge |

**Slice 1 (this commit) is the trusted lane, run by hand.** The daily/PR automation
and the untrusted-PR sandbox come later — see "Roadmap".

## Running it

### 1. Locally on the host (fastest for iterating)

```bash
cd e2e
cp .env.e2e.example .env.e2e     # fill in a disposable test account (optional for anon specs)
pnpm install
pnpm install:browser             # Chromium + deps, one time
pnpm test                        # runs against https://dev.studio.harperfabric.com by default
```

The **anon** specs (sign-in page, verifying screen) run with no credentials. The
**setup** + **authed** specs (login, org users) skip cleanly until you add a test
account to `.env.e2e`.

`pnpm test` runs the functional specs (green out of the box); it excludes the
`@visual` pixel-diff test, which needs a baseline first (see below).

Useful:

- `pnpm test:visual` — visual regression only (needs baselines)
- `pnpm test:all` — functional + visual
- `pnpm test:ui` — interactive runner
- `pnpm test:headed` — watch it drive the browser
- `pnpm report` — open the last HTML report
- `pnpm codegen` — record selectors against a running target

### 2. In the container (canonical / for baselines)

```bash
cd e2e
docker compose run --rm e2e
```

Use this whenever screenshots are involved — see below.

## Screenshot baselines

Visual assertions (`toHaveScreenshot`) are pixel-compared, so font antialiasing must
match. **Generate and commit baselines only from the Linux container** — host-generated
`*-darwin` / `*-win32` snapshots are gitignored on purpose.

```bash
docker compose run --rm e2e pnpm update-snapshots   # regenerate, then review the diff before committing
```

## Layout

```
e2e/
  playwright.config.ts   projects: setup (login) → authed; anon (no session)
  auth.setup.ts          logs in via UI once, saves cookie storageState
  tests/
    sign-in.anon.spec.ts     sign-in page render + validation + visual baseline
    verifying.anon.spec.ts   email-verification screens (no inbox needed yet)
    org-users.authed.spec.ts app shell + org users list (needs a test account)
  Dockerfile / docker-compose.yml / .dockerignore
  .env.e2e.example         copy to .env.e2e (gitignored)
```

Naming drives which project runs a spec: `*.anon.spec.ts` = no session,
`*.authed.spec.ts` = logged-in.

## Conventions worth knowing

- **Hash routing.** Routes are `/#/sign-in`, `/#/verifying`, `/#/<orgId>/users`.
- **No test-ids** in these flows — drive by role/label/text (`getByRole`, `getByLabel`).
  The only `data-testid`s in the app are in instance analytics.
- **Auth is a cookie** (`POST /Login/`); the `Studio:PotentiallyAuthenticated`
  localStorage flag is only a hint. `storageState` captures the cookie.
- **Errors are Sonner toasts** (`[data-sonner-toast]`), not inline form messages.
- **Verification is link/token-based** (`/#/verify-email?token=`) — no numeric code.

## Email round-trip (Mailosaur)

`signup-verification.anon.spec.ts` does the full loop: sign up with a fresh controlled
address → fetch the email via Mailosaur → follow the `?token=` link → confirm the account
is verified by signing in without bouncing to `/#/verifying`. Config: set
`MAILOSAUR_API_KEY` and `MAILOSAUR_SERVER_ID` in `.env.e2e` (see `mail.ts`).

Two operational gotchas:

- **Signup is domain-allowlisted.** central-manager `User.allowCreate` rejects signup (403)
  unless the email domain matches the `ALLOWLIST_EMAIL_DOMAINS` Configuration record. The
  Mailosaur server domain (or a Mailosaur custom domain under an already-allowlisted domain)
  must be in that list, or the test skips itself with a pointer.
- **Account churn.** Each run creates a real account on the target env. Before wiring into a
  daily loop, add a cleanup story (backend test-account purge) or a dedicated throwaway tenant.

## Roadmap

1. **Resend-invite** — seed a `PENDING` org user fixture, assert the detail-modal flow.
2. **Automation** — laptop polls for (a) daily, (b) merge-to-`stage`, (c) allowlisted-author
   PRs; deterministic suite runs, Claude triages failures into issues/PRs.
3. **PR lane isolation** — run the PR's build in a container on an egress-restricted
   network; the LLM reading the diff runs confined, and proposed test changes land as
   PRs you review (never auto-merged — a malicious PR must not be able to neuter the
   very test that would catch it).

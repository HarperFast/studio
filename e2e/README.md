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
| Isolation | Sandboxed (container + egress allowlist)    | Container + egress allowlist           |
| Output    | Failure → issue/PR you review               | Proposed test diffs → PR **you** merge |

The **control plane** that runs these lanes autonomously — the trusted-lane scheduler
(launchd: daily + merge-to-`stage`), the untrusted-PR sandbox + egress lock, and the LLM
triage/adapter prompts — lives in a separate repo,
[`studio-e2e-harness`](https://github.com/HarperFast/studio-e2e-harness), deliberately kept
out of this repo so a studio PR can't alter what decides whether or how its code is run. The
**specs stay here**, co-located with the app for local dev; both lanes exercise these same
files. Run them locally with the commands below.

## Running it

### 1. During local development — against your running UI (fastest feedback)

While developing studio (with `pnpm dev` running on :5173), point the tests at your local
UI so regressions surface as you edit:

```bash
cd e2e
pnpm install && pnpm install:browser   # one time
pnpm test:local:ui                      # UI mode: watch, pick tests, time-travel debug
pnpm test:local                         # headless, one-shot
```

`test:local*` target `http://localhost:5173` and reuse your running dev server (or start one
if none). The **anon** specs (sign-in, verification screens) need no credentials — ideal for
spotting UI regressions while you work. Note your local dev server talks to the **stage**
backend (per `.env.local`), so the **authed** + round-trip specs need a test account valid on
_that_ backend in `.env.e2e`; without it they skip cleanly. `pnpm test:local:ui` (Playwright
UI mode) is the tightest loop — live re-run + step-through.

### 2. Headless against the deployed dev app (what the trusted lane runs)

```bash
cd e2e
cp .env.e2e.example .env.e2e     # disposable test account + Mailosaur (optional for anon specs)
pnpm install && pnpm install:browser
pnpm test                        # runs against https://dev.studio.harperfabric.com by default
```

`pnpm test` runs the functional specs (green out of the box); it excludes the `@visual`
pixel-diff test, which needs a baseline first (see below).

Useful:

- `pnpm test:visual` — visual regression only (needs baselines)
- `pnpm test:all` — functional + visual
- `pnpm test:ui` / `pnpm test:headed` — interactive / headed (deployed target)
- `pnpm report` — open the last HTML report
- `pnpm codegen` — record selectors against a running target

### 3. In the container (canonical / for baselines)

```bash
cd e2e
docker compose run --rm e2e
```

Use this whenever screenshots are involved — see below. From the **repo root**, these are also
exposed as scripts so you don't have to remember the compose invocation:

```bash
npm run test:e2e:docker      # run the suite in the canonical Linux container
npm run test:e2e:snapshots   # (re)generate the *-linux screenshot baselines
```

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
  tests/
    auth.setup.ts            logs in via UI once, saves cookie storageState
    sign-in.anon.spec.ts     sign-in page render + validation + visual baseline
    verifying.anon.spec.ts   email-verification screens
    signup-verification.anon.spec.ts  full signup → email → verify → login round-trip
    org-users.authed.spec.ts app shell + org users list (needs a test account)
    mail.ts                  Mailosaur wrapper (controlled inbox)
    testData.ts              shared fixtures
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
- **Sign-in and sign-up render every submit failure inline**
  (`p[role="alert"][data-slot="form-message"]`). **Forgot-password renders only CAPTCHA rejections
  and retryable failures** (5xx/429/transport) inline and still toasts the rest, so assert on the
  toast for a 4xx there. Don't write a case that expects the toast to reveal whether an account
  exists — that page deliberately answers the same way either way. Errors elsewhere are Sonner toasts (`[data-sonner-toast]`).
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
  must be in that list; otherwise the round-trip **fails** with a pointer to this, unless the
  explicit escape hatch `E2E_ALLOW_SIGNUP_403_SKIP=1` is set (a 403 is at least as likely to be an
  authz/WAF regression as a misconfigured allowlist, so failing is the safe default).
- **Account churn.** Each run creates a real account on the target env; the spec self-deletes it in
  a `finally` (see `deleteThrowawayAccount`). A failure before login has no session to delete, so
  the odd account can still leak — worth an occasional sweep.

## Roadmap

**Automation + PR-lane isolation are built** — they live in the
[`studio-e2e-harness`](https://github.com/HarperFast/studio-e2e-harness) control plane: a
launchd trusted lane (daily + merge-to-`stage` poll, LLM triage into issues) and a hardened,
egress-locked sandbox that builds + tests untrusted PR code, with proposed spec changes landing
as review PRs (never auto-merged — a malicious PR must not be able to neuter the very test that
would catch it).

Next, here in the specs:

1. **Resend-invite** — seed a `PENDING` org user fixture, assert the detail-modal flow.
2. **More coverage** — broaden beyond auth/org-users as the flows the lanes protect grow.

## Skips are deliberate, and narrow

A monitor that skips is a monitor that lies. These specs **fail rather than skip whenever a
prerequisite they were _given_ stops working** — the disposition is decided here, in the specs, so
it does not depend on what any runner happens to check:

- **Unresolvable organization** → failure (a broken post-login redirect or org picker looks exactly
  like "no org"). Opt out with `E2E_ALLOW_NO_ORG=1` for an account that genuinely has none.
- **Signup 403** → failure (as likely an authz/WAF regression as the email-domain gate). Opt out
  with `E2E_ALLOW_SIGNUP_403_SKIP=1` once you've confirmed it's `ALLOWLIST_EMAIL_DOMAINS`.
- **Org-users 403** → failure (as likely an authz regression as a provisioning gap). Opt out with
  `E2E_ALLOW_ORG_USERS_403_SKIP=1` once you've confirmed the account simply lacks users-view.

None of those variables is set by the automated lanes.

What remains a skip is only the case where the environment genuinely cannot run a spec at all — no
test account (`PLAYWRIGHT_USER_*`) or no Mailosaur config. Those are absence-of-configuration, not
ambiguity, and they are visible as `skipped` in the report.

> Defense in depth, not the guarantee: the harness's trusted lane also fails a run when any spec
> skips (a rotated credential would otherwise leave the authed specs quiet). That check lives in
> [studio-e2e-harness#2](https://github.com/HarperFast/studio-e2e-harness/pull/2) and is **not on
> that repo's `main` yet** — so treat it as a second layer that is still landing, and rely on the
> per-spec dispositions above.

# Deploying Studio

Studio ships to a Harper CM as a component: a deploy drops the built `web/` bundle next to
`deploy-template/` and hands the result to `harper deploy_component`. The template is what
teaches Harper's fastify server to serve those files.

## The layout

Four workflows own the deploy path, plus three composite actions. (`verify-pr.yaml` and
`verify-commits.yaml` gate pull requests and are not part of deploying.)

| Workflow            | Runs on                  | Holds credentials                                              |
| ------------------- | ------------------------ | -------------------------------------------------------------- |
| `deploy-dev.yaml`   | push to `dev`, manual    | yes — CM + Datadog; its `e2e` job only the `e2e-dev` secrets   |
| `deploy-stage.yaml` | push to `stage`, manual  | yes — CM + Datadog + `contents: write`; `e2e` only `e2e-stage` |
| `deploy-prod.yaml`  | push to `prod`, manual   | yes — CM + Datadog                                             |
| `verify-stage.yaml` | `merge_group` on `stage` | **no**                                                         |

- **`.github/actions/studio-verify`** — install, test, lint, optionally build. **Takes no
  credentials, by design.**
- **`.github/actions/studio-deploy`** — release, version, build, sourcemap upload, staging the
  component, deploy. Every credentialed step lives here. Assumes verify installed first.
- **`.github/actions/studio-e2e`** — after a deploy, wait until the environment serves the new
  build, then run `e2e/` against it. Takes e2e test-account credentials, never deploy ones — see
  [Post-deploy e2e](#post-deploy-e2e).

The three deploy workflows are deliberately thin: they own only what differs per environment —
trigger branch, concurrency group, sourcemap URL, which secrets, and whether a push releases. A
change to _how_ Studio deploys belongs in an action; a change to _where_ it deploys belongs in
the workflow.

The action split is a security boundary, not tidiness: `pnpm install` alone runs postinstall
scripts from whatever ref is checked out, so the installing side must never hold a credential.
Keep it that way — **never add a credential input to `studio-verify`**, and never move an
installing or test-running step into `studio-deploy`.

Every workflow declares `permissions:` explicitly, because the repo default is **write**. A job
that omits the block gets a write-capable token whether it needs one or not; only `deploy-stage`
needs `contents: write`, and only because semantic-release pushes the tag.

## The merge queue, and why no deploy workflow accepts `merge_group`

The merge queue is in use on `stage`. **`verify-stage.yaml` owns its check** — `Verify Stage` is
the check name to require for the queue.

No _credentialed_ workflow may accept `merge_group`. That event runs the workflow and action YAML
**from the merge-group ref** — the candidate PR's own code — so it can request `contents: write`,
delete an event guard, or replace a local action. **A boundary expressed in candidate-controlled
YAML is not a boundary**, which is why the deploy workflow does not accept the event at all
rather than trying to be safe while accepting it (studio#1649).

`src/lib/workflowPrivilege.test.ts` asserts this for any workflow that grants write, omits a
`permissions:` block, or references a secret. `actionlint` cannot: it never evaluates a
workflow's event set against its job permissions, and it skips composite action bodies. Note the
invariant is "no _privileged_ workflow on `merge_group`" — `verify-stage.yaml` subscribes and
passes, because it holds nothing worth stealing.

Two limits worth knowing:

- **This is detection plus review, not platform enforcement.** A PR could re-add the trigger to a
  credentialed workflow and delete the test in one diff; required code-owner review is what
  stands in the way. The durable fix is GitHub's workflow-execution protections at the org
  control plane, which cannot be weakened from inside the repo — an org-admin setting, noted on
  studio#1649.
- **This workflow gates only once `Verify Stage` is a required check for the queue.** Whether it
  already is lives in repo settings, not here — if you are relying on it, confirm it there. The
  failure mode if the name and the setting disagree is that entries never merge: the queue waits
  for a check nothing reports, hits its check-response timeout, and ejects the entry as failed.
  That is the safe direction — it never merges unchecked — but the signal is "my PR keeps falling
  out of the queue", not an error naming the missing check.

### What the queue check is for

Per-PR CI only ever sees one ref, so it cannot catch a break that exists only in the combination.
Demonstrated against real code on `stage`: rename an export and update all ten importers in one
PR, add a new file importing the old name in another, and each PR passes `tsc -b` and vitest on
its own — while the two together fail type-check with
`Module '"@/lib/humanFileSize"' has no exported member 'humanFileSize'`. Unit tests pass the
combination; only `tsc -b` over the merged ref catches it — which is why `verify-stage.yaml`
passes `build: 'true'`, since the `build` script is `tsc -b && vite build`.

## The template's `@fastify/static` range

`@fastify/static` majors declare the fastify major they register against, and the template runs
on the fastify embedded in the CM's Harper — so the range has to suit that, not just be the newest
release. Every CM runs Harper 5.x (fastify 5), which `@fastify/static` v8 through v10 all accept.
(harperdb 4.x embedded fastify 4 and needed v7; Studio no longer deploys to it.)

Renovate keeps the range current. Minor and patch bumps group with the other non-major
dependencies; a **major waits for approval on the Dependency Dashboard** (`renovate.json`),
because nothing in CI loads the template. Before approving one, check which fastify major it
targets and run `verify-static.mjs` (next to the template) against the fastify major Harper
embeds.

There is one template for every environment, so it can only target one fastify major. If CMs
ever run Harper majors with different embedded fastify majors again, the range has to differ per
environment again too — `git log -S FASTIFY_STATIC_V5` shows how that was last done.

### A wrong range fails silently, and late

A range that does not match the CM's fastify does **not** fail the deploy, and does not break at
the next push either. `deploy_component` writes the range to disk while the running workers keep
the version they already imported, so the deploy is green and Studio keeps serving.

The break lands at the **next restart** — a CM upgrade, a host reboot, a worker respawn — with no
deploy anywhere near it in the timeline. `fastify-plugin`'s version check rejects the plugin,
`reply.sendFile` is never decorated, and the CM answers `GET /` with
`{"error":"reply.sendFile is not a function"}` while every static asset 404s.

Two consequences:

- **After a range change reaches an environment, redeploy it from Run workflow with `restart`
  on.** A push deploys `restart: false`, so without it the new version sits on disk unused and a
  bad bump surfaces at some later, unrelated restart instead of right after the deploy that
  caused it. The two are independent because an ordinary redeploy should not bounce workers.
- **One range serves the whole cluster.** `deploy_component … replicated=true` pushes one
  `package.json` to every node, so during a rolling Harper upgrade that changes the embedded
  fastify major, Studio works or 404s depending on which node the load balancer picks. Move the
  range at the boundary of such a rollout, not during one.

## The manual restart

Exposed on every environment's **Run workflow** button, and only there: **Restart the component
after deploying** — off by default. This replaced three `… with Restart` workflows, now deleted,
that differed only in `restart=`.

`inputs.*` is empty for anything but a manual run, and an empty value _overrides_ an action
input's declared default rather than falling back to it — so the callers default it themselves
(`inputs.restart || false`) and the action re-normalizes in shell, treating anything that is not
exactly `true` as the default. Two independent guards, either sufficient on its own: a restart
only happens because someone asked for it.

## Post-deploy e2e

`deploy-dev.yaml` and `deploy-stage.yaml` each run an `e2e` job after their deploy job, in the same
run, so a red suite turns that deploy run red. Nothing rolls back — the deploy has already happened.
Prod is not wired yet. Stage is the steadier signal while `dev` integrates unfinished epics: a stage
run tests what is about to be promoted, a dev run what is still being integrated.

- **Same commit by construction.** The job checks out the run's own commit and waits until the site
  serves the version the deploy job just built (`studio-deploy`'s `version` output, the
  `VITE_STUDIO_VERSION` in the entry chunk), for up to 10 minutes. `dev` is an integration branch
  that does not track `stage`, so `stage`'s specs against the dev site compare two different
  commits: that is what turned studio-e2e-harness#10 red, 36 failures for features dev did not have.
  A deploy that never goes live fails the job too.
- **Every node, not a sample.** The public origin reaches whichever node the load balancer picks, so
  repeated checks through it cannot prove every node updated. `deploy_component … replicated=true`
  names the peers it replicated to, `studio-deploy` passes them on as its `nodes` output, and the
  gate probes each by its own hostname alongside the public origin: every one must serve the new
  version, three rounds in a row. The node the deploy ran on reports its own result; its hostname is
  part of the `CLI_DEPLOY_TARGET` secret, so it is not probed by name. This relies on each peer's
  Harper node name being the public hostname it serves Studio on — true today: dev is a single node
  (`replicated: []`), stage replicates to `stage-2.studio.harperfabric.com` and prod to
  `studio-2.harperfabric.com`. A name that is not a hostname fails the gate rather than being skipped, and stage sets
  `expected-peers: 1` so a deploy report that names no peer fails it too, instead of quietly
  falling back to the public origin alone.
- **Its own runner, its own secrets.** The job never receives the CM or Datadog credentials. Its
  test-account secrets live in the `e2e-dev` / `e2e-stage` environment; each restricted to its own
  branch (setup below), a job on any other branch cannot read them — the scoping studio#1651 wants for the deploy
  secrets. `src/lib/workflowPrivilege.test.ts` pins that an e2e job references no deploy secret,
  only reads the repo, and never overrides the checkout ref.
- **What fails it:** a failed test, a skipped test (a skip means a prerequisite the run was given
  stopped working — `e2e/README.md`, "Skips are deliberate"), no tests run, or no report. Flaky
  tests warn. Playwright stops after 10 failures or 25 minutes (the signup round-trip alone may take
  10 minutes an attempt), inside the job's 45, so a slow red run still writes its report.
- **What it publishes:** the log, failure annotations and a job summary with a repro command. **No
  trace, video, screenshot or HTML report is uploaded**: anyone signed in to GitHub can download a
  public repo's artifacts, and a Playwright trace records the session cookie. GitHub masks the
  configured secrets; a value a spec generates (the round-trip's address, password and
  verification token) must be masked by the spec with `maskInCi` (`e2e/tests/maskInCi.ts`)
  before anything can print it.
- **Concurrency:** the workflow-level group (`dev`, `stage-deploy`) spans the e2e job, so the next
  deploy to that environment waits for it — a deploy landing mid-run would change the build under
  the tests. GitHub keeps one
  pending run per group, so a burst of pushes waits for one e2e run, not one each. **Re-run failed
  jobs** re-runs only `e2e`, which passes its gate only while that version is still deployed.

**Create the environment before the job reaches its branch.** GitHub auto-creates a missing
environment with no secrets and no branch policy, so until this runs every deploy of that branch
goes red on skipped specs, and nothing restricts which branch could read secrets added later.
Values come from whoever owns the test accounts — never a personal login — and each environment
gets its own Mailosaur server and key. The signup round-trip also needs that Mailosaur domain in the
environment's `ALLOWLIST_EMAIL_DOMAINS`, or signup answers 403 and the run fails. For stage, replace
`e2e-dev` and `dev` with `e2e-stage` and `stage`:

```bash
gh api -X PUT repos/HarperFast/studio/environments/e2e-dev \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/HarperFast/studio/environments/e2e-dev/deployment-branch-policies -f name=dev -f type=branch
for name in PLAYWRIGHT_USER_EMAIL PLAYWRIGHT_USER_PASSWORD MAILOSAUR_API_KEY MAILOSAUR_SERVER_ID; do
  gh secret set "$name" --env e2e-dev --repo HarperFast/studio
done
```

`PLAYWRIGHT_ORG_ID` is optional; without it the authed specs use the account's post-login landing.

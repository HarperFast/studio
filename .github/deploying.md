# Deploying Studio

Studio ships to a Harper CM as a component: a deploy drops the built `web/` bundle next to
`deploy-template/` and hands the result to `harper deploy_component`. The template is what
teaches Harper's fastify server to serve those files.

## The layout

Four workflows own the deploy path, plus three composite actions. (`verify-pr.yaml` and
`verify-commits.yaml` gate pull requests and are not part of deploying.)

| Workflow            | Runs on                  | Holds credentials                                            |
| ------------------- | ------------------------ | ------------------------------------------------------------ |
| `deploy-dev.yaml`   | push to `dev`, manual    | yes — CM + Datadog; its `e2e` job only the `e2e-dev` secrets |
| `deploy-stage.yaml` | push to `stage`, manual  | yes — CM + Datadog + `contents: write`                       |
| `deploy-prod.yaml`  | push to `prod`, manual   | yes — CM + Datadog                                           |
| `verify-stage.yaml` | `merge_group` on `stage` | **no**                                                       |

- **`.github/actions/studio-verify`** — install, test, lint, optionally build. **Takes no
  credentials, by design.**
- **`.github/actions/studio-deploy`** — release, version, build, sourcemap upload, staging the
  component, deploy. Every credentialed step lives here. Assumes verify installed first.
- **`.github/actions/studio-e2e`** — after a deploy, wait until the environment serves the new
  build, then run `e2e/` against it. Takes e2e test-account credentials, never deploy ones — see
  [Post-deploy e2e](#post-deploy-e2e).

The three deploy workflows are deliberately thin: they own only what differs per environment —
trigger branch, concurrency group, sourcemap URL, which secrets, whether a push releases, and
which Harper major the CM runs. A change to _how_ Studio deploys belongs in an action; a change
to _where_ it deploys belongs in the workflow.

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

## Choosing the Harper major

`@fastify/static` majors track fastify majors, and Harper embeds fastify: v7 pairs with fastify 4
(harperdb 4.x), v8 with fastify 5 (Harper 5.x).

**Each environment defaults to the major its CM runs today** — currently `v5` for dev, stage and
prod — not to the major we intend to end up on. The rest position of a switch should be where
the system is, so merging a change to this repo never moves a CM by itself, and shelving or
resuming Harper 5 is an explicit act.

Each caller's `harper-version: ${{ inputs.harper_version || '<major>' }}` line **is the source of
truth**. The dispatch input overrides a single run and does _not_ stick, so a one-off manual `v5`
deploy is undone by the next ordinary push. **When a CM changes major in central manager, change
that literal in the same breath**, along with the dispatch input's `default:` — changing only the
default leaves every push on the old major.

There is one template. It carries the 4.x pin, and a `v5` deploy rewrites that single range as it
stages the component (`FASTIFY_STATIC_V5` in `studio-deploy`) — so the range is by construction
the only difference between a v4 and a v5 deploy, with no second copy to drift. Renovate is
configured not to touch `@fastify/static` (`renovate.json`), so both versions only move
deliberately.

Once every CM is on one major again, drop the `harper_version` input and the override step, and
pin the template to whatever that major needs.

### Getting it wrong fails silently, and late

Pairing the wrong major does **not** fail the deploy, and does not break at the next push either.
`deploy_component` writes the range to disk while the running workers keep the major they already
imported, so the deploy is green and Studio keeps serving.

The break lands at the **next restart** — a CM upgrade, a host reboot, a worker respawn — with no
deploy anywhere near it in the timeline. `fastify-plugin`'s version check rejects the plugin,
`reply.sendFile` is never decorated, and the CM answers `GET /` with
`{"error":"reply.sendFile is not a function"}` while every static asset 404s. That silence is the
only reason the CM's Harper major is a deploy input at all.

Two consequences:

- **A deliberate major switch must be deployed from Run workflow with `restart` on.** Without it
  the new range sits on disk unused and the switch has silently not happened yet. The two inputs
  are independent because an ordinary redeploy should not bounce workers.
- **The input assumes a homogeneous cluster.** `deploy_component … replicated=true` pushes one
  `package.json` to every node, so mid-rolling-upgrade a cluster running both majors gets a
  single range cluster-wide, and Studio works or 404s depending on which node the load balancer
  picks. Flip the literal at the boundary of a major rollout, not during one.

## The two manual knobs

Exposed on every environment's **Run workflow** button, and only there:

- **Restart the component after deploying** — off by default. This replaced three
  `… with Restart` workflows, now deleted, that differed only in `restart=`.
- **Harper major version running on the target CM** — defaults to whatever that environment's CM
  runs (above).

`inputs.*` is empty for anything but a manual run, and an empty value _overrides_ an action
input's declared default rather than falling back to it — so the callers default it themselves
(`inputs.restart || false`) and the action re-normalizes in shell, treating anything that is not
exactly `true`/`v5` as the default. Two independent guards, either sufficient on its own: a
restart or a v5 deploy only happens because someone asked for it.

## Post-deploy e2e

`deploy-dev.yaml` runs an `e2e` job after `deployToDev`, in the same run, so a red suite turns the
deploy run red. Nothing rolls back — the deploy has already happened. Stage and prod are not wired
yet.

- **Same commit by construction.** The job checks out the run's own commit and waits until the site
  serves the version the deploy job just built (`studio-deploy`'s `version` output, the
  `VITE_STUDIO_VERSION` in the entry chunk) on three checks in a row, for up to 10 minutes. `dev` is
  an integration branch that does not track `stage`, so `stage`'s specs against the dev site compare
  two different commits: that is what turned studio-e2e-harness#10 red, 36 failures for features dev
  did not have. A deploy that never goes live fails the job too.
- **Its own runner, its own secrets.** The job never receives the CM or Datadog credentials. Its
  test-account secrets live in the `e2e-dev` environment; restricted to the `dev` branch (setup
  below), a job on any other branch cannot read them — the scoping studio#1651 wants for the deploy
  secrets. `src/lib/workflowPrivilege.test.ts` pins that an e2e job references no deploy secret,
  only reads the repo, and never overrides the checkout ref.
- **What fails it:** a failed test, a skipped test (a skip means a prerequisite the run was given
  stopped working — `e2e/README.md`, "Skips are deliberate"), no tests run, or no report. Flaky
  tests warn. The run stops after 10 failures, which bounds how long it holds the `dev` group.
- **What it publishes:** the log, failure annotations and a job summary with a repro command. **No
  trace, video, screenshot or HTML report is uploaded**: anyone signed in to GitHub can download a
  public repo's artifacts, and a Playwright trace records the session cookie.
- **Concurrency:** the workflow-level `dev` group spans the e2e job, so the next dev deploy waits
  for it — a deploy landing mid-run would change the build under the tests. GitHub keeps one
  pending run per group, so a burst of pushes waits for one e2e run, not one each. **Re-run failed
  jobs** re-runs only `e2e`, which passes its gate only while that version is still deployed.

To set up an environment's secrets (values from whoever owns the test accounts — never a personal
login; give each environment its own Mailosaur server and key):

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

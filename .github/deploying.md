# Deploying Studio

Studio ships to a Harper CM as a component: a deploy drops the built `web/` bundle next to
`deploy-template/` and hands the result to `harper deploy_component`. The template is what
teaches Harper's fastify server to serve those files.

## The layout

Four workflows own the deploy path, plus two composite actions. (`verify-pr.yaml` and
`verify-commits.yaml` gate pull requests and are not part of deploying.)

| Workflow            | Runs on                  | Holds credentials                      |
| ------------------- | ------------------------ | -------------------------------------- |
| `deploy-dev.yaml`   | push to `dev`, manual    | yes — CM + Datadog                     |
| `deploy-stage.yaml` | push to `stage`, manual  | yes — CM + Datadog + `contents: write` |
| `deploy-prod.yaml`  | push to `prod`, manual   | yes — CM + Datadog                     |
| `verify-stage.yaml` | `merge_group` on `stage` | **no**                                 |

- **`.github/actions/studio-verify`** — install, test, lint, optionally build. **Takes no
  credentials, by design.**
- **`.github/actions/studio-deploy`** — release, version, build, sourcemap upload, staging the
  component, deploy. Every credentialed step lives here. Assumes verify installed first.

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

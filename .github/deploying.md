# Deploying Studio

Studio ships to a Harper CM as a component: a deploy drops the built `web/` bundle next to
`deploy-template/` and hands the result to `harper deploy_component`. The template is what
teaches Harper's fastify server to serve those files.

## Two actions, three workflows

`deploy-dev.yaml`, `deploy-stage.yaml` and `deploy-prod.yaml` are deliberately thin. They own only
what differs per environment — trigger branch, concurrency group, sourcemap URL, which secrets,
and whether a push releases — and hand the rest to two composite actions:

- **`.github/actions/studio-verify`** — install, test, lint, and optionally build. **Takes no
  credentials, by design.**
- **`.github/actions/studio-deploy`** — release, version, build, sourcemap upload, staging the
  component, deploy. Every credentialed step lives here. Assumes verify installed first.

The split is a security boundary, not tidiness. A `merge_group` run executes these actions from
the merge-group ref, which contains the candidate PR's code — including any edit to the actions
themselves — and `pnpm install` alone runs PR-controlled postinstall scripts. So the stage
workflow skips `studio-deploy` outright on a merge-queue run, and checkout does not persist the
job's token into `.git/config` except on the push that releases. Keep it that way: **never add a
credential input to `studio-verify`**, and never move an installing or test-running step into
`studio-deploy`.

**What this does not buy, stated plainly:** the five deploy secrets and the persisted git
credential are out of reach of an unmerged PR, but `permissions: contents: write` on the stage
job applies to every event, and a `merge_group` run executes candidate-controlled YAML — which
can read `${{ github.token }}` directly. Closing that means giving the merge-queue check
read-only permissions and moving the release into its own job, which renames the check branch
protection gates on. Worth doing deliberately; it is not something `persist-credentials` can fix.

A change to how Studio deploys belongs in an action; a change to where it deploys belongs in the
workflow.

Two knobs are exposed on every environment's **Run workflow** button, and only there:

- **Restart the component after deploying** — off by default. This replaced three
  `… with Restart` workflows, now deleted, that differed only in `restart=`.
- **Harper major version running on the target CM** — `v4` (default) or `v5`.

`inputs.*` is empty for anything but a manual run. Note that an empty value _overrides_ an
action input's declared default rather than falling back to it, so the callers default it
themselves (`inputs.restart || false`) and the action re-normalizes in shell, treating anything
that is not exactly `true`/`v5` as the default. Two independent guards, either of which is
sufficient — a restart or a v5 deploy only happens because someone asked for it.

**The per-environment default is the source of truth, not the dispatch input.** Each caller's
`harper-version: ${{ inputs.harper_version || '<major>' }}` line records the major that
environment's CM actually runs; the dispatch input overrides a single run and does _not_ stick.
So a one-off manual `v5` deploy is undone by the next ordinary push unless that literal is
updated too — when a CM changes major in central manager, change it here in the same breath.

## Switching majors requires a restart

Deploying a template writes it to disk; it does not reload the running workers, which have
already imported — or already failed to register — the previous `@fastify/static`. A push
resolves `restart` to false, so **a deploy that changes the Harper major has no effect until the
workers restart**, and a CM currently broken on the wrong major stays broken. Any major switch
must therefore be deployed from **Run workflow** with **restart** on, and the two inputs are
deliberately independent because an ordinary redeploy should not bounce workers.

## Why the Harper major matters

`@fastify/static` majors track fastify majors, and Harper embeds fastify: v7 pairs with
fastify 4 (harperdb 4.x), v8 with fastify 5 (Harper 5.x).

Registering the wrong one does not fail at deploy time. `fastify-plugin`'s version check
rejects the plugin, `reply.sendFile` is never decorated, and the CM answers `GET /` with
`{"error":"reply.sendFile is not a function"}` while every static asset 404s. That silent
failure is the only reason the CM's Harper major is a deploy input at all.

There is still just **one** template. It carries the 4.x pin, and a `v5` deploy rewrites that
single range as it stages the component (see `FASTIFY_STATIC_V5` in the action) — so the range
is by construction the only thing that differs between a v4 and a v5 deploy, with no second
copy of the template to drift out of sync. Renovate is configured not to touch
`@fastify/static` (`renovate.json`), so both versions only move deliberately.

**Harper 4.x is the default.** The Harper 5 rollout is shelved after stage testing, so nothing
deploys the 5.x range unless someone picks `v5` for a specific environment.

Getting this wrong for a CM already on Harper 5.x does **not** break at deploy time, and does not
break at the next push either. `deploy_component` writes the 4.x range to disk while the running
workers keep the 5.x one they already imported, so the deploy is green and Studio keeps serving.
The break lands at the _next restart_ — a CM upgrade, a host reboot, a worker respawn — with no
deploy anywhere near it in the timeline, which is considerably harder to diagnose than an
immediate failure. Set the environment's literal correctly rather than planning to fix it later.

The input also assumes a **homogeneous cluster**: `deploy_component … replicated=true` pushes one
`package.json` to every node, so mid-rolling-upgrade a cluster running both majors gets a single
range cluster-wide, and Studio works or 404s depending on which node the load balancer picks.
Flip the literal at the boundary of a major rollout, not during one.

Once every CM is on one major again, drop the `harper_version` input and the override step, and
pin the template to whatever that major needs.

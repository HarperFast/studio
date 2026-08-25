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
workflow skips `studio-deploy` outright on a merge-queue run, and nothing that a merge-queue run
does execute is ever handed a token. Keep it that way: **never add a credential input to
`studio-verify`**, and never move an installing or test-running step into `studio-deploy`.

A change to how Studio deploys belongs in an action; a change to where it deploys belongs in the
workflow.

Two knobs are exposed on every environment's **Run workflow** button, and only there:

- **Restart the component after deploying** — off by default. This replaced three
  `… with Restart` workflows that were copies of these differing only in `restart=`.
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
deploys the 5.x range unless someone picks `v5` for a specific environment. If a CM is _already_
on Harper 5.x, its next push deploys the 4.x range and its static assets will 404 until it is
either rolled back or deployed manually with `harper_version: v5`.

Once every CM is on one major again, drop the `harper_version` input and the override step, and
pin the template to whatever that major needs.

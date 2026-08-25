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

The split is a security boundary, not tidiness: `pnpm install` alone runs postinstall scripts
from whatever ref is checked out, so the installing side must never hold a credential. Keep it
that way — **never add a credential input to `studio-verify`**, and never move an installing or
test-running step into `studio-deploy`.

## No deploy workflow accepts `merge_group`

A `merge_group` run executes the workflow and action YAML _from the merge-group ref_ — the
candidate PR's own code. So it can request `contents: write`, delete an event guard, or replace a
local action. **A boundary expressed in candidate-controlled YAML is not a boundary**, which is
why stage does not accept the event at all rather than trying to be safe while accepting it
(studio#1649). `src/lib/workflowPrivilege.test.ts` asserts this for any workflow that writes
contents or receives deploy secrets; `actionlint` cannot, because it never evaluates the event
set against job permissions.

Two consequences worth knowing:

- **Enabling a merge queue needs its own change.** Add a separate credential-free verification
  workflow and make its check required in the same reviewed change. A required merge-queue check
  with no producer stays pending, so forgetting fails closed rather than merging unchecked.
- **This is detection plus review, not platform enforcement.** A PR could re-add the trigger and
  delete the test in one diff; required code-owner review is what stands in the way. The durable
  fix is GitHub's workflow-execution protections at the org control plane, which cannot be
  weakened from inside the repo — an org-admin setting, noted on studio#1649.

Every workflow declares `permissions:` explicitly, because the repo default is **write**. A job
that omits the block gets a write-capable token whether or not it needs one; only stage does.

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

**Each environment defaults to the major its CM runs today** — dev `v5`, stage `v5`, prod `v4` —
not to the major we intend to end up on. That is deliberate: the rest position of a switch should
be where the system is, so merging a change to this repo never moves a CM by itself, and shelving
or resuming Harper 5 is an explicit act. **When a CM changes major in central manager, change its
literal here in the same breath**, or the next ordinary push quietly re-introduces the mismatch.

Getting it wrong does **not** fail the deploy, and does not break at the next push either.
`deploy_component` writes the range to disk while the running workers keep the major they already
imported, so the deploy is green and Studio keeps serving. The break lands at the _next restart_ —
a CM upgrade, a host reboot, a worker respawn — with no deploy anywhere near it in the timeline,
which is considerably harder to diagnose than an immediate failure. For the same reason, a
deliberate major switch must be deployed from **Run workflow** with **restart** on; without it the
new range sits on disk unused and the switch silently has not happened yet.

The input also assumes a **homogeneous cluster**: `deploy_component … replicated=true` pushes one
`package.json` to every node, so mid-rolling-upgrade a cluster running both majors gets a single
range cluster-wide, and Studio works or 404s depending on which node the load balancer picks.
Flip the literal at the boundary of a major rollout, not during one.

Once every CM is on one major again, drop the `harper_version` input and the override step, and
pin the template to whatever that major needs.

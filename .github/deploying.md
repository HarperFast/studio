# Deploying Studio

Studio ships to a Harper CM as a component: a deploy drops the built `web/` bundle next to
`deploy-template/` and hands the result to `harper deploy_component`. The template is what
teaches Harper's fastify server to serve those files.

## One action, three workflows

`deploy-dev.yaml`, `deploy-stage.yaml` and `deploy-prod.yaml` are deliberately thin. They own
only what actually differs per environment — trigger branch, concurrency group, sourcemap URL,
which secrets, and whether a push releases — and hand the rest to
`.github/actions/deploy-studio`, which holds the whole job body (test, lint, release, build,
sourcemap upload, staging the component, deploy). A change to how Studio deploys belongs in the
action; a change to where it deploys belongs in the workflow.

Two knobs are exposed on every environment's **Run workflow** button, and only there:

- **Restart the component after deploying** — off by default. This replaced three
  `… with Restart` workflows that were copies of these differing only in `restart=`.
- **Harper major version running on the target CM** — `v4` (default) or `v5`.

`inputs.*` is empty for anything but a manual run, so a push lands on the action's defaults
(`v4`, no restart), and the action treats anything that is not exactly `true`/`v5` as the
default too. A restart or a v5 deploy only ever happens because someone asked for it.

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

**Harper 4.x is the default.** Harper 5 is exercised by hand, one environment at a time, while
the fleet is mid-upgrade. Once every CM is on the same major, drop the `harper_version` input
and the override step, and pin the template to whatever that major needs.

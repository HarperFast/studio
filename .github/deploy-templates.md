# Deploy templates

Studio ships to a Harper CM as a component: the deploy workflows drop the built `web/` bundle
next to one of the `deploy-template*` directories and hand the result to
`harper deploy_component`. The template is what teaches Harper's fastify server to serve those
files, and it is the only part of the deploy that cares which Harper major the CM runs.

## Why there are two

`@fastify/static` majors are pinned to fastify majors, and Harper embeds fastify:

| Template             | `@fastify/static` | fastify | Harper CM    |
| -------------------- | ----------------- | ------- | ------------ |
| `deploy-template`    | `^7.0.4`          | 4.x     | harperdb 4.x |
| `deploy-template-v5` | `^8.3.0`          | 5.x     | Harper 5.x   |

Registering the wrong one does not fail loudly at deploy time. `fastify-plugin`'s version check
rejects the plugin, `reply.sendFile` is never decorated, and the CM answers `GET /` with
`{"error":"reply.sendFile is not a function"}` while every static asset 404s. So the pairing above
is the whole reason the template is duplicated.

**`deploy-template` (Harper 4.x) is the default.** Harper 5 is only being exercised by hand while
the fleet is mid-upgrade; a push to `dev`/`stage`/`prod` always deploys the 4.x template.

## Deploying the v5 template

Run the environment's workflow manually (Actions → _Deploy to Dev_ / _Deploy to Stage_ /
_Deploy to Prod_ → **Run workflow**) and set:

- **Harper major version** — `v4` (default) or `v5`. `v5` swaps in `deploy-template-v5`.
- **Restart the component after deploying** — off by default. This input replaces the old
  _… with Restart_ workflows, which were copies of these three differing only in `restart=`.

Both inputs exist only on a manual run. Push- and merge-queue-triggered runs see empty inputs and
fall back to the defaults, and anything that is not exactly `true`/`v5` is treated as the default
too — so a restart or a v5 deploy only ever happens because someone asked for it.

## Keeping the two in sync

Everything except the `@fastify/static` version must stay identical, or a fix to `fastify/static.js`
reaches one Harper major and not the other. `Verify PR` enforces that: it diffs the trees ignoring
`package.json`, diffs the two `package.json`s with the `@fastify/static` value masked out, and
asserts the majors are still 7 and 8. Renovate is configured not to touch `@fastify/static`
(`renovate.json`), so these versions only move deliberately.

Collapse back to a single template — and drop the `harper_version` input, the `-v5` directory and
that check — once every CM is on the same Harper major.

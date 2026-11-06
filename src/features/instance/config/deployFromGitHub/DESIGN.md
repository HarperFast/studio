# Deploy from GitHub — design notes

## Studio writes what `harper deploy setup=true provider=github-actions` writes

Previews have a server operation (`enable_previews`) that owns the names and the rules. Production deploys don't: the
CLI composes `add_role`, `add_user` and `add_oidc_trust` on the client (harper `bin/deploySetupGithubActions.ts`), and
harper's `security/DESIGN.md` names these "names Studio's setup must match". So Studio composes the same operations, as
the signed-in super user, with the same records:

- role and user `<app>-ci-deploy`, policy `github-actions-<app>`;
- the role's operations are exactly the CLI's `CI_DEPLOY_OPERATIONS` (`deploy_component`, `get_deployment`, `get_job`,
  `registration_info`) with no `component_deploy` grant, and the policy's scope is the same list;
- the policy pins `repository_id`, `workflow_ref` and `environment`, under GitHub's issuer, for the cluster's audience.

The reconcile is a port of harper's `security/ciIdentity.ts` (`integrations/api/instance/ciDeploy/ciIdentity.ts`), not a
look-alike, because the two have to agree: a role Studio wrote with one more grant would make the next CLI run refuse it,
and the reverse. Setup only creates. A matching record is kept, and a differing one, a deactivated user, a disabled
policy, or another enabled policy that could match the same runs for a different user stops it before it writes. It lists
the policies again just before `add_oidc_trust`, which replaces, and reads the policy back afterwards, comparing it claim
by claim and failing on `invalid_reason`, since a mismatch otherwise shows up only as the exchange's 401 in CI. A policy
another super user creates within that last round trip is still replaced and reported as created, as with the CLI:
closing it needs a create-only write in Harper, and `hdb_oidc_trust` replicates, so even that would be per node.

## What the CLI does that this doesn't

The CLI also sets the `HARPER_CLI_TARGET` repository variable with `gh`, and checks the workflow file in the checkout it
runs from. The browser has neither GitHub write access nor a checkout, so the panel shows the variable's value to set and
hands out the workflow instead. That workflow passes harper's own `checkWorkflowFile` for the branch and environment the
policy pins.

## The version floor is 5.3.0-beta.3

The trust operations exist from 5.3.0-alpha.1, but before beta.3 the operations allowlist matched `deploy_component` and
`registration_info` against handler names no grant equals (harper#2175), so the role could not deploy. Both the nav and
the Application menu use the floor, and so does the page itself, for a bookmark.

## The status is a rerun, planned

Once the policy exists, the page reads `list_oidc_trust`, `list_roles` and `list_users` and plans exactly as setup would,
from the policy's own claims and the cluster's current URL. So it shows what a rerun would refuse, and "Finish setup" is
that rerun: it creates a role or user someone deleted and touches nothing else. A policy of that name whose claims aren't
this shape is shown, but not managed; it has to be dropped on the Trust Policies page first.

The audience comes from the shared `useActionsAudience` (`config/githubActions/`), never from the instance client, whose
`baseURL` is the proxy's when a connection falls back to it.

## An application doesn't have to exist yet

A new repository's first deploy is the one this sets up, so the page also takes the name of an application that isn't on
the cluster yet. A preview is refused: its own workflow deploys it.

## The workflow is create-harper's

It is the `deploy.yaml` create-harper scaffolds (create-harper#156) without its `test` job and `pull_request` trigger,
which need a package manager Studio can't know. The branch, environment and application are written as quoted strings,
so a value like `1.0` stays text, and the branch and environment are held to characters that can't end a YAML value or
the `if:` expression's string. That is narrower than git allows, and covers the names people use.

deploy-action is pinned by commit, as create-harper pins it. The Previews panel's workflow names `@v1` instead.

## Failures render beside the form

Setup is several writes, so a failure says what was created before it stopped, and a rerun finishes it. Refusals and
4xx are expected answers, so they skip the global toast and RUM. A 5xx or no answer still reaches RUM through
`console.error` at mutation level (`AGENTS.md`, "Dropping `errorHandler` from an `onError` also drops the RUM report").
The user's password is 32 random bytes that are never shown; nothing signs in with it.

## Where GitHub can't reach, it warns and the CLI tab deploys from the laptop

GitHub's hosted runners can't reach a loopback, private or `.local` address, so the form warns about such an audience. It
doesn't refuse it, since a self-hosted runner on that network can. New Application → CLI shows create-harper's
`deploy:setup-ci` outro only on a cluster at the floor, at an address hosted runners can reach, outside Local Studio.
Anywhere else, including a cluster whose version can't be read, it keeps `npm run deploy` from the laptop, and while
the version is loading it shows neither. That outro also needs a 5.4 CLI: harper 5.3.5's
`deploy setup` refuses `provider=github-actions`, so the step says to install `harper@next` until 5.4 ships.

## New Application leads here from all three tabs

- **Import → Git** installs a repository once. When the URL names a GitHub repository (on github.com, or on the host
  alias of an SSH key whose hostname is github.com), a line under it links here with `project` and `repository` in the
  search, and the form starts with that repository. It shows wherever the Application menu offers this page.
- **Templates** makes an application that lives only on the cluster, so there is no repository to deploy from. Its
  link opens the CLI tab instead, whose `npm create harper` then passes `--template` for whichever template is chosen.
  Opening the CLI tab directly passes none, and create-harper asks.
- **Harper CLI** ends with the outro above.

The Templates link and the page's subtitle mention GitHub only where the CLI tab ends with that outro, and say nothing
of it while the version loads.

# PR previews — design notes

## The cluster owns them

Harper's `enable_previews`, `disable_previews` and `get_preview_policy` hold the names, the reconcile rules and the
teardown order, so Studio only collects the inputs and shows the answers (harper `security/DESIGN.md`, "PR previews are
enabled by the cluster"). Central Manager has no part in the operations. The panel uses the same instance client as the
rest of the page, so a connection that falls back to the Fabric Connect proxy carries these calls too, unchanged. The
one Central Manager call here is the existing secrets key lookup for a managed cluster, which the Secrets page makes too.

`audience` never comes from the client's `baseURL`, which is the proxy's on that fallback. It comes from the cluster's
own record, then the auth store, and `previewAudience` refuses a proxy URL. On an instance page it is still the
cluster's URL, because previews belong to the cluster.

## The version floor is 5.4.0-alpha.2, not 5.4.0-alpha.1

`5.4.0-alpha.1` was tagged at `e942ebef8`, before harper#3617 merged as `4ed1155ed`, and the package npm serves as that
version has no `enable_previews`. Harper `main` still called itself `5.4.0-alpha.1` when this was built, so a local build
of `main` reads as too old until its version moves. Any later prerelease, or `5.4.0`, passes. Both the catalog's `addedIn`
and `supportsPreviews` use this floor.

## `previewSetupState` has three states, because `enabled: false` means two things

`get_preview_policy` reports each record it can't find in `problems`, so an application that never had previews answers
`enabled: false` with four problems. Showing those would alarm someone who hasn't done anything. `off` is that case
exactly: no grant, no policies, and every problem a missing record. Anything else with `enabled: false` is `incomplete`,
which is a damaged setup or a disable that stopped, and the page shows its problems and offers the disable that resumes.

## Failures render beside what failed

A 409 from enable is an answer meant for a person, and it spans several lines, so all three mutations opt out of the
global toast and render inline. A 4xx is not reported to RUM. A 5xx or a network failure still is, with `console.error`
at mutation level, because skipping the toast also skips `errorHandler`'s report (`AGENTS.md`, "Dropping `errorHandler`
from an `onError` also drops the RUM report").

An unanswered `disable_previews` is safe to repeat: it resumes. So the panel always offers the rerun, even though the
global copy for an unanswered write warns against repeating one.

`drop_component` shows each peer's result, which is why it sets `keepReplicationFailures`: the shared interceptor
otherwise turns a failed peer into a rejected string, and the peers that did drop it are lost.

## The private repository credential is sealed here, not sent to the CLI

The epic's goal is one toggle and one workflow file, and the CLI needs a checkout of the repository. Studio already
seals secrets in the browser, so `PreviewCredential` does what `harper preview setup credential=true` does: `set_secret`
without grants, then `grant_secret` to `<app>-pr-*`, under the name harper's `deriveGitSecretName` gives that pattern.
The two calls matter, because `set_secret` with `grants` replaces the row's grants and would drop one someone added.

GitHub answers an anonymous lookup of a private repository with a 404, so the panel can't tell private from mistyped. It
asks for the token whenever the lookup didn't find the repository, and says so in those words. The same 404 hides the
repository's spelling, which `workflow_ref` needs exactly, so the form takes the id and the name together from one
`gh api` line rather than trusting what was typed, and refuses a line for another repository.

## The repository lookup is shared

`integrations/github/lookUpGitHubRepository.ts` belongs to neither panel. Deploy from GitHub (studio#1788) needs the same
id, and the same parse of what people paste. The id has to be GitHub's, and so does the spelling: `workflow_ref` is
compared byte for byte, so `harperfast/studio` would never match `HarperFast/studio`.

## The workflow text is a copy

Harper has no operation that returns `starterPreviewWorkflow`, so `starterPreviewWorkflow.ts` copies it, and is the only
file to change when `HarperFast/deploy-action` (harper#3055) ships. Harper's installs `harper@^5.4`, which matches no
prerelease, so on a prerelease cluster the panel writes that cluster's version instead. Otherwise the file can't install
the CLI until 5.4.0 is published.

## A drop replicates from any page of a cluster

A preview is on every node, so a drop from one instance's page has to reach the rest. It replicates whenever the route
has a cluster, not only when the entity is one. Local Studio has no cluster, and `replicated: true` fails there.

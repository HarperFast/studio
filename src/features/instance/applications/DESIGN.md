# Applications — design notes

## When a deploy is done

Studio deploys with `restart: 'rolling'`. The node that receives the deploy answers once its own part is done and hands
the other nodes to a `restart_service` job, named in the response's `restartJobId` (Harper 4.6+). The deployment record
does not help: only the receiving node writes it, so it reads `success` while that job runs and after it fails.

So [`deployAndFollowComponent`](../../../integrations/api/instance/applications/deployComponent.ts) follows the job with
`get_job` before the mutation settles ([`restartJob.ts`](../../../integrations/api/instance/applications/restartJob.ts)):

- **A failed job rejects with `DeployRolloutError`.** The release is live on the receiving node; the error and the
  progress panel name each node that did not take it. Its message quotes those nodes' errors, so Datadog withholds it
  like `SSEOperationError`.
- **A job Studio could not follow resolves, as `rollout.state === 'unfollowable'`, and is never reported as success.**
  [`reportDeployOutcome`](modals/reportDeployHealth.ts) skips the post-deploy health check for it, because that check
  reads the one node Studio reaches, which can be healthy on the release a rejecting node kept. Any new caller of the
  deploy mutation has to make the same distinction.
- **The job may not be there.** `hdb_job` is a non-replicating system table, so only the receiving node can answer for
  it. Central manager's cluster proxy sends every operation to the first running instance, so over the proxy the deploy
  and its polls reach the same node; a direct connection to a cluster's address can reach another node, which answers
  `[]`. A row missing for 20 seconds counts as `not-found`.
- **Every node's outcome arrives at once.** Harper writes the job's row when it starts and when it ends, never in between.

The job comes in two shapes. Harper 5.4's certified rollout activates the staged release on each other node, and each
certifies it with a canary of its own: `result.activated` on success, `message: { error, activated }` on failure. Older
versions, and a 5.4 deploy whose release was not armed for a canary, run the plain restart: `result.replicated`, where a
node the job could not reach is listed with its error and the job still completes, so that node reads `unconfirmed`.

Canary certification is shown only when the response carries it, which only 5.4+ does. There is no version check on
the deploy path: `registration_info` is denied to a role with an operations allowlist, which is exactly the kind of
role that may be allowed to deploy, so a version gate there would hide the result from it.

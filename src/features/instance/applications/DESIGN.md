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
  That covers a job that ended with a result in neither shape below. [`reportDeployOutcome`](modals/reportDeployHealth.ts)
  skips the post-deploy health check for it, because that check reads the one node Studio reaches, which can be healthy
  on the release a rejecting node kept; `reportDeployResult` is the same policy for a caller that does not health-check.
  Any new caller of the deploy mutation reports through one of the two.
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

## Staging and activation are gated the other way

Stage only (`activate: false`) and Activate (`deployment_id`) are offered only when `registration_info` reads 5.3.0 or
later (`useStagedDeploymentsAvailable`), and an unreadable version offers neither. The difference from certification is
what happens when the guess is wrong: a node older than 5.3.0 accepts `activate: false` as an unknown field and makes
the release live, which is the opposite of what the person asked for. Certification only adds a field to a response.

All three kinds of request are built in one place, [`deployRequestBody`](../../../integrations/api/instance/applications/deployComponent.ts),
because Harper's validator refuses the wrong mix outright: a stage with `restart`, or an activation carrying `package`,
install options or `activate`. A stage succeeds only once every other node confirmed staging it, so a stage restarts
nothing and is reported without a health check. Rollback to a kept release (#1232) is the same activation call.

## A live deploy is sent once

A live (SSE) deploy that gets no event stream goes out again as the buffered POST only when its status proves Harper
never started it: a 4xx. Harper refuses a request before the operation starts (authentication, permissions,
validation) with a 4xx, and answers one it started with a 200 event stream at once. Everything else can follow a deploy
that is already running: a gateway's 5xx after forwarding, a 2xx that is not a stream, a dropped connection, the idle
watchdog firing before headers. Harper's own request-queue 503 never started anything either, but status alone cannot
tell it from a gateway's. So [`onDeployComponentSubmit`](../../../integrations/api/instance/applications/deployComponent.ts)
turns those into `SSEInconclusiveError`, which every deploy caller already answers by checking rather than resending.
`streamOperation` stays neutral: it puts the `status` on `SSEUnsupportedError` and leaves the decision to the caller,
because a read (`get_deployment`) may fall back on anything.

## Who reports a failed deploy

Every caller of [`useDeployComponentMutation`](../../../integrations/api/instance/applications/deployComponent.ts)
shows its own failure. The mutation opts out of the global error toast and reports the failure to RUM itself, with a
mutation-level `console.error` that still runs after the caller unmounts. A new caller has to render or toast the
rejection, or the person sees nothing.

Callers await `mutateAsync` rather than reporting from `mutate()` callbacks, which React Query drops once the caller
unmounts. Following a rollout keeps a deploy pending for up to 30 minutes, so its outcome often lands after the form
or modal that started it is gone. A failure that lands while its progress panel or import form is still on screen is
shown there only; one that lands later goes to a toast, with the deployment record when the failure named one.

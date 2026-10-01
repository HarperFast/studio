# Cluster lifecycle screens

## Cluster RUNNING doesn't mean every instance has settled

Central manager's cluster status means "serviceable", not "every member settled". A scale-up patches the cluster
`RUNNING` once its new members reach `CLONING`, because CM's `waitForInstanceStatus` counts `CLONING` as success. A new
cluster can likewise report `RUNNING` while members are still copying. So the Starting-up and Scaling screens also
derive completion from the instances, in [`allInstancesRunning.ts`](allInstancesRunning.ts):

- **Starting-up** waits for every instance to be running. The admin user must not be created until every member is up.
- **Scaling** waits only until nothing is still in progress. `STOPPED`, `ERROR` and `FAILED` count as at rest, or
  scaling a cluster with a stopped member would never finish.

Both treat a missing or unknown status as still in progress.

## Clone progress is approximate, and only read in a clone status

[`cloneProgress.ts`](cloneProgress.ts) reads `cloneExpectedGb`, `cloneProgressGb`, `cloneProgressAt` and
`cloneStartedAt` only while `isCloning` holds (a hand-kept mirror of CM's `CLONE_STATUSES`):

- CM leaves the fields on the row after the instance reaches `RUNNING`.
- CM stamps them only on entry to `CLONE_READY`, so `CLONE_PENDING` shows a waiting state rather than a previous
  clone's figures.

"Copied" is the new instance's whole-disk usage, and "expected" is the source's usage when the copy started. The ratio
can therefore pass 100% or plateau below it, which is why it is clamped and both figures are labelled `~`.

There is no "stalled" or "host not reporting" state. Telling those apart needs the host's last report time, which CM
does not expose.

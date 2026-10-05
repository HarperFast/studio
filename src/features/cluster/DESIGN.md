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

Scaling also has a failure state. Central manager marks the cluster `FAILED` when an update task crashes while the
cluster is still `UPDATING`, because a partial update leaves the cluster's shape unknown. Scaling then says the update
didn't finish, links to the instances and points at support. It offers no retry or edit link: central manager's
`assertClusterMutable` refuses any update unless the cluster is `RUNNING` with no `FAILED` instance, so either would end
in a 400 ([HarperFast/studio#1784](https://github.com/HarperFast/studio/issues/1784)).

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

## The cluster card's sync chip comes from central manager

The cluster list reads only the organization response, which doesn't expand instances, and it does no per-card
polling. So the card can't derive sync state from instances the way the Instances table and the Starting-up and
Scaling screens do. It reads the organization response's `clusterSyncSummaries` instead — computed by central manager
and keyed by cluster id ([HarperFast/central-manager#888](https://github.com/HarperFast/central-manager/issues/888)) —
which `buildClusterList` attaches to each list item. A cluster with no entry, or a response without the map, shows no
chip.

The chip reads "Syncing", or "Syncing · ~31%" once every copy has an expected size. The percent is the slowest
member's progress, not the cluster's total bytes: a cluster is synced when its last member is, and a byte total read 50%
with one member not yet started. It deliberately shows no instance count: Studio presents a cluster as one entity.

## A 403 on the cluster route means setup isn't finished

`clusterLayoutRoute` loads the cluster in `beforeLoad`, so a refusal fails the route before any page under it renders.
Central manager answers `GET /Cluster/{id}` with 403 to members who aren't org admins until a new cluster's setup is
finished; its other per-cluster refusals read as 404, so they can't be mistaken for this. The route's
[`ClusterRouteError`](components/ClusterRouteError.tsx) shows "Pending Owner Setup" for a 403 and the generic error
page for anything else. Handle it there, not per page: every page under the route would otherwise need its own check.

The cluster card links a `PROVISIONING` cluster to Starting-up and an `UPDATING` one to Scaling for every viewer, so a
non-admin on a new cluster lands on that message instead of a dead card
([HarperFast/studio#1773](https://github.com/HarperFast/studio/issues/1773)).

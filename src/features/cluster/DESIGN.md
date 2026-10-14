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

Both figures are fractional. Host manager reports each instance's usage every 90 seconds, in base-10 GB to four decimal
places
([`monitoringController.js#L421-L423`](https://github.com/HarperDB/host-manager/blob/b4ab9ada5324bde2e26f9b79c9291b7266d091e6/src/controllers/monitoringController.js#L421-L423)),
and central manager stores any growth over 10 MB
([`cloneProgress.js#L75-L80`](https://github.com/HarperFast/central-manager/blob/63bba08b68f26111223d294273af6aaa9ef191bb/src/lib/cloneProgress.js#L75-L80)).
So the caption shows a copy under 1 GB in MB rather than rounding it to `~0 GB`, and hides an amount that would still
read as `~0`. In practice that is the 0 central manager stamps on entry to `CLONE_READY`, which stays until the first
report over 10 MB ([HarperFast/studio#1925](https://github.com/HarperFast/studio/issues/1925)).

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

## A terminated cluster keeps only its overview and usage

Central manager keeps a terminated cluster's record, so Studio can still open it. `isDeletedCluster`
([`clusterStatuses.ts`](../../config/clusterStatuses.ts)) is the one test for "gone": `TERMINATING`, `TERMINATED` or
`REMOVED`, or `FAILED` with `terminatedAt` (a first build that was rolled back). For such a cluster the overview says it
is gone, and the cluster rail ([`ClusterPageLayout`](components/ClusterPageLayout.tsx)) keeps only Overview, plus Usage
on a managed cluster (a self-hosted one never shows Usage). Scaling (Configuration when self-hosted), Version, Domains
and Instances are hidden, the same way the rail already hides what a member's permissions don't allow. A bookmark to one
of those pages, or to the `/scaling` update screen, redirects to the overview (`redirectAwayFromDeletedCluster`).
Starting-up, where Finish-setup sends a cluster that isn't ready, says the cluster is gone too. It checks for `FAILED`
first, so a rolled-back build still offers Try Again.

None of the hidden pages can do anything there. Central manager's `assertClusterMutable` refuses every update to a cluster
that isn't `RUNNING`, and the instances are torn down, along with the certificates issued on them. Nor is anything left
to unbind under Domains: once the instances are torn down, `deleteCluster` sets `clusterId` to null on each of the
cluster's domains, so the organization can bind them to another cluster or delete them
([`deleteCluster.js#L133-L141`](https://github.com/HarperFast/central-manager/blob/642af5eadfde95cf174d73d04cec468abaf006f2/src/resources/cluster/deleteCluster.js#L133-L141)).
It leaves the cluster's own `domainIds` in place, so a terminated cluster's `domains` still lists them, though none is
bound to it any more.

That unbind is best-effort and runs after the teardown is committed, so a failure is only logged. A domain it missed
stays bound to the dead cluster, and only support can release it: `DELETE /Domain` refuses a bound domain, and the
cluster can no longer change.

## Custom domains: cert intent is cluster-wide, and certificate progress is polled

`generateDomainCerts` is one flag for the whole cluster. Central manager reads an absent flag on a `domainIds` edit as
unchanged, and stamps the result onto every running instance and the Cluster row, which later expansions read
([HarperFast/central-manager#669](https://github.com/HarperFast/central-manager/pull/669)). So only a bind states it:
an unbind that sent `false` would revoke it for every domain still bound
([HarperFast/studio#1626](https://github.com/HarperFast/studio/issues/1626)).

Nothing pushes certificate progress. Central manager answers the domain change before host manager acts on it; host
manager then upserts a `ChallengeCertificate` row per added domain, and Studio reads progress from that row's
`issueDate` and `inProgress`. The Domains table polls those rows at 5s while one is generating or for three minutes
after a domain change (`watchChallengeCertificates`, which the mutation calls), and once a minute otherwise. A cluster
without the table answers 404, which `getSearchByValue` reads as an empty result, so an idle poll never errors and
nothing else stops it ([HarperFast/studio#1630](https://github.com/HarperFast/studio/issues/1630)).

The Bind selection is page state that outlives its rows, so Bind counts and sends only the ticked domains the current
list still offers for binding (`canBindDomain`, the same predicate that renders the checkbox). A removal takes its row
out of the cached list as soon as it succeeds, rather than when the refetch lands, and Bind waits while one is in flight
([HarperFast/studio#1800](https://github.com/HarperFast/studio/issues/1800)).

## Custom domains: a domain change is built and checked from a fresh read

`PUT /Cluster/{id}` replaces the cluster's whole `domainIds` list, and central manager unbinds every domain the new
list leaves out without checking which cluster that domain is bound to. So callers of `useSetDomainIdsOnCluster` pass
intent (`add`, `remove`), and the mutation builds the list from a fresh read of the cluster and of the organization's
domains, never from what the page last saw: another tab or member may have bound a domain since.

Before sending, it refuses what central manager would refuse, so the user gets a reason instead of a bare 400
([HarperFast/studio#1686](https://github.com/HarperFast/studio/issues/1686)), in
[`describeDomainChangeRefusal.ts`](../clusters/mutations/describeDomainChangeRefusal.ts):

- **The cluster can't change.** Central manager's `assertClusterMutable` refuses every cluster update, edits included,
  unless the cluster is `RUNNING` and no instance is `FAILED` or in its `TRANSITIONING_INSTANCE_STATES`, which include
  `STOPPED` and `UPDATED`. Studio keeps a copy of that list. A status missing from the copy still reaches central
  manager, whose own refusal is then shown, so the copy must never list more than central manager's does.
- **A domain it touches is refused.** That covers a missing, unverified or foreign-bound domain, and a self-managed
  cluster. Studio refuses rather than drops. Dropping a domain bound elsewhere would unbind it there. Dropping a deleted
  id doesn't help either: Harper resolves a missing id in the `domains` relationship to `undefined`, so central
  manager's own removal loop fails on such a cluster whatever the request carries. A refusal over a domain the cluster
  already lists points at support, since nothing on the page clears it.

Failures stay on the page beside the control, for both domain changes and cluster edits, and the global toast is off
for both mutations. Each mutation reports a real request failure to RUM itself, at mutation level, but not a refusal,
which is Studio declining to send.

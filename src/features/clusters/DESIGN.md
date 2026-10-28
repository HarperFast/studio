# Cluster list

`lib/clusterListModel.ts` derives lifecycle categories, counts and filters from the same organization snapshot; its tests pin missing-data and self-hosted semantics. A running lifecycle is not a monitoring-health assertion. Regions combine resolved plan labels with available non-retired instance labels, deduplicating matches, because organization responses need not expand instances; the list resolves opaque ids through the existing organization-scoped region catalog once, without polling. Missing labels remain unreported without discarding other reported instance regions. Running classification uses the same activeClusterStatuses rule as card navigation; UPDATED remains attention until RUNNING is reported. The model still derives instance count and version when instance data is supplied, but the card no longer renders them: the organization response does not currently expand instances, so those two cells only ever showed a dash, and the Regions cell (real plan labels) went with the row. The list adds no per-card detail polling. Existing `ClusterProgress` retains its lifecycle polling behavior.

A saved cluster draft makes the list redirect to the form, and that redirect replaces its history entry (#1326). The
form clears the draft only once it mounts, so a pushed redirect left Back on the list, which pushed the form again for
as long as the form was still loading. Billing's Stripe return page replaces itself on the way back to the form for the
same reason: it strips the setup-intent secret from its own URL first, so going back to it would show a spinner forever.

Which form a draft belongs to is read the same way in all three places, by `upsert/draftClusterIdOf.ts` (#1852). A
draft saved during an edit carries `clusterId`, and nothing else does: a new-cluster draft, a failed cluster being tried
again (a whole `Cluster`, keyed `id`) and a `createCluster` link all leave it unset. The list and the billing return page
send an edit draft to that cluster's edit form, and the form applies a draft only when its `clusterId` matches the
route's, so an edit draft never fills a create form. The list redirects an edit draft only for a cluster the
organization lists; any other edit draft is left saved for the organization it came from. The form clears the draft
once it mounts and again when it saves, and `UpsertCluster` lets those clears through only for a draft of this form, so
visiting another form, including the create form an empty organization's list shows, never discards one. That check
reads the stored draft at the moment of the clear rather than a render's copy: the billing step saves a draft and clears
it again across an `await`, from a render that never saw it.

SystemStatus notices have no cluster association and remain in the cloud-wide notification banner/center. Per-cluster monitoring incidents and scheduled maintenance need a scoped backend contract before the list can attribute them. The UI preserves ClusterCard's permission checks and lifecycle actions.

# Cluster configuration

The upsert page keeps a single form owner for create, edit, and version-only flows. Details submit remains inside the HTML form; payment review uses its existing click handler outside that form. The shared price summary uses the existing price calculations on both steps and follows the fields on narrow screens. `cluster-form.anon.spec.ts` pins request payloads, partial-upgrade retry, billing transitions, and responsive bounds.

The form terminates a cluster only after creating its replacement: Try Again on a failed cluster's card opens a
create prefilled from it, and once that create succeeds the form terminates the original if it's still `FAILED`.
`sourceClusterId` names that original, but the form also fills it with the edited cluster's own id on an edit, and
saved form values can bring it back after a billing redirect. So `onClusterSavedCallback` gates the terminate on
`creating`, not on `sourceClusterId` alone. Without that gate, an update that failed straight away made an edit delete
the cluster it was editing.

A tier with `allowedRegionIds` takes one region, and the form corrects that region whenever it is the only one left,
which includes the moment a second region is removed. A custom region is never corrected, since the allow-list describes
the catalog. The correction keeps the chosen region, matching the catalog entry's name for the stored region id, and
moves only its latency when the tier offers that region at all. It falls back to the default region only when the tier
offers nothing there (#1275).

Central manager refuses a cluster update that leaves every region the cluster runs in while adding another, so moving a
cluster takes two saves. It matches a catalog region by name, whatever its latency tier, and a custom region by id
(`regionCohortKey`). `lib/describeRegionSwap.ts` blocks that selection on an edit with the steps instead of letting the
update fail (#1311). It mirrors only the case the server is certain to refuse, so it can never block an update the
server would accept. The server also counts shrinking a kept region as leaving it (a smaller tier of a catalog region,
or fewer units of a custom one); a selection that shrinks every current region while adding one is not mirrored and
still gets the server's error.

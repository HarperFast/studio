# Cluster list

`lib/clusterListModel.ts` derives lifecycle categories, counts and filters from the same organization snapshot; its tests pin missing-data and self-hosted semantics. A running lifecycle is not a monitoring-health assertion. Regions combine resolved plan labels with available non-retired instance labels, deduplicating matches, because organization responses need not expand instances; the list resolves opaque ids through the existing organization-scoped region catalog once, without polling. Missing labels remain unreported without discarding other reported instance regions. Running classification uses the same activeClusterStatuses rule as card navigation; UPDATED remains attention until RUNNING is reported. The model still derives instance count and version when instance data is supplied, but the card no longer renders them: the organization response does not currently expand instances, so those two cells only ever showed a dash, and the Regions cell (real plan labels) went with the row. The list adds no per-card detail polling. Existing `ClusterProgress` retains its lifecycle polling behavior.

SystemStatus notices have no cluster association and remain in the cloud-wide notification banner/center. Per-cluster monitoring incidents and scheduled maintenance need a scoped backend contract before the list can attribute them. The UI preserves ClusterCard's permission checks and lifecycle actions.

# Cluster configuration

The upsert page keeps a single form owner for create, edit, and version-only flows. Details submit remains inside the HTML form; payment review uses its existing click handler outside that form. The shared price summary uses the existing price calculations on both steps and follows the fields on narrow screens. `cluster-form.anon.spec.ts` pins request payloads, partial-upgrade retry, billing transitions, and responsive bounds.

The form terminates a cluster only after creating its replacement: Try Again on a failed cluster's card opens a
create prefilled from it, and once that create succeeds the form terminates the original if it's still `FAILED`.
`sourceClusterId` names that original, but the form also fills it with the edited cluster's own id on an edit, and
saved form values can bring it back after a billing redirect. So `onClusterSavedCallback` gates the terminate on
`creating`, not on `sourceClusterId` alone. Without that gate, an update that failed straight away made an edit delete
the cluster it was editing.

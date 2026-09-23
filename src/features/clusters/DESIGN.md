# Cluster list

`lib/clusterListModel.ts` derives lifecycle categories, counts and filters from the same organization snapshot; its tests pin missing-data and self-hosted semantics. A running lifecycle is not a monitoring-health assertion. Regions use plans first because organization responses need not expand instances; the list resolves opaque ids through the existing organization-scoped region catalog once, without polling. Missing catalog entries remain unreported. Instance count/version remain unreported until instance data is supplied; the list adds no per-card detail polling. Existing `ClusterProgress` retains its lifecycle polling behavior.

SystemStatus notices have no cluster association and remain in the cloud-wide notification banner/center. Per-cluster monitoring incidents and scheduled maintenance need a scoped backend contract before the list can attribute them. The UI preserves ClusterCard's permission checks and lifecycle actions.

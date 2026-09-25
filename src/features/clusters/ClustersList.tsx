import { SubNavMenu } from '@/components/SubNavMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isLocalStudio } from '@/config/constants';
import { ClusterCard } from '@/features/clusters/components/ClusterCard';
import {
	buildClusterList,
	type ClusterCategory,
	type ClusterListControls,
	type ClusterSort,
	defaultClusterListControls,
	selectClusters,
} from '@/features/clusters/lib/clusterListModel';
import { getRegionLocationsOptions } from '@/features/clusters/queries/getRegionLocationsQuery';
import { UpsertCluster } from '@/features/clusters/upsert';
import { OrgPageLayout } from '@/features/organization/components/OrgPageLayout';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from '@tanstack/react-router';
import { CircleAlert, CircleCheck, Layers, Plus, SearchIcon, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';

const summaryTiles = [
	{ category: 'all', label: 'Total clusters', Icon: Layers, color: 'text-primary dark:text-violet-300 bg-primary/10' },
	{ category: 'running', label: 'Running', Icon: CircleCheck, color: 'text-emerald-700 dark:text-green bg-green/10' },
	{
		category: 'attention',
		label: 'Needs attention',
		Icon: TriangleAlert,
		color: 'text-amber-700 dark:text-yellow bg-yellow/10',
	},
	{ category: 'failed', label: 'Failures', Icon: CircleAlert, color: 'text-destructive bg-destructive/10' },
] as const;

export function ClustersList() {
	const { organizationId }: { organizationId: string } = useParams({ strict: false });
	const { create } = useOrganizationClusterPermissions(organizationId);
	const { data: orgInfo } = useSuspenseQuery(getOrganizationQueryOptions(organizationId));
	const [savedClusterState] = useLocalStorage<unknown | null>(LocalStorageKeys.SavedClusterState, null);
	const [controls, setControls] = useState<ClusterListControls>(defaultClusterListControls);
	const { data: regionCatalog } = useQuery({
		...getRegionLocationsOptions({ organizationId }),
		enabled: !isLocalStudio,
		staleTime: 60_000,
	});
	const regionNames = useMemo(() => new Map(regionCatalog?.map(region => [region.id, region.region])), [regionCatalog]);
	const model = useMemo(() => buildClusterList(orgInfo?.clusters ?? [], regionNames), [orgInfo?.clusters, regionNames]);
	const filteredClusters = useMemo(() => selectClusters(model.items, controls), [model.items, controls]);
	const hasFilters = !!controls.search || controls.category !== 'all' || !!controls.region;

	if (orgInfo && model.items.length === 0 && create) {
		return <UpsertCluster />;
	}
	if (savedClusterState) {
		return <Navigate to={`/${organizationId}/new-cluster`} />;
	}

	return (
		<>
			<SubNavMenu />
			<OrgPageLayout>
				<div className="pb-16">
					<header className="cluster-overview-hero relative mb-6 flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl border border-primary/10 bg-linear-to-br from-primary/10 via-background to-background p-5 sm:p-6">
						<h1 className="text-2xl font-bold tracking-normal sm:text-3xl">Clusters</h1>
						{create && (
							<Button variant="positive" asChild accessKey="n" className="shrink-0">
								<Link to={`/${organizationId}/new-cluster`}>
									<Plus aria-hidden="true" /> New Cluster
								</Link>
							</Button>
						)}
					</header>
					<div
						className="mb-3 hidden grid-cols-2 gap-3 sm:grid lg:grid-cols-4"
						role="group"
						aria-label="Cluster summary"
					>
						{summaryTiles.map(({ category, label, Icon, color }) => (
							<button
								key={category}
								type="button"
								aria-label={`${label} ${category === 'all' ? model.items.length : model.counts[category]}`}
								aria-pressed={controls.category === category}
								onClick={() => setControls({ ...controls, category })}
								className={`flex items-center gap-3 rounded-xl border bg-card/30 p-4 text-left transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring ${
									controls.category === category ? 'border-primary/60' : 'border-border'
								}`}
							>
								<span className={`rounded-full p-2.5 ${color}`}>
									<Icon className="size-5" aria-hidden="true" />
								</span>
								<span className="min-w-0">
									<span className="block text-xs text-muted-foreground">{label}</span>
									<span className="mt-1 block text-2xl font-semibold tabular-nums">
										{category === 'all' ? model.items.length : model.counts[category]}
									</span>
								</span>
							</button>
						))}
					</div>
					<p className="mb-6 text-xs text-muted-foreground">
						Reported lifecycle status. Running does not confirm monitoring health.
					</p>
					<div className="cluster-list-controls mb-3 flex flex-wrap gap-3" role="search" aria-label="Find clusters">
						<div className="relative min-w-48 basis-full sm:basis-auto flex-1">
							<SearchIcon
								className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
								aria-hidden="true"
							/>
							<Input
								aria-label="Search clusters"
								placeholder="Search name, hostname, or region…"
								className="h-10 pl-9"
								value={controls.search}
								onChange={event => setControls({ ...controls, search: event.target.value })}
							/>
						</div>
						<label className="sr-only" htmlFor="cluster-status">Cluster status</label>
						<select
							id="cluster-status"
							className="h-10 rounded-md border border-input bg-card px-3 text-sm"
							value={controls.category}
							onChange={event => setControls({ ...controls, category: event.target.value as ClusterCategory | 'all' })}
						>
							<option value="all">All statuses</option>
							<option value="running">Running</option>
							<option value="attention">Needs attention</option>
							<option value="failed">Failures</option>
							<option value="other">Other / unknown</option>
						</select>
						<label className="sr-only" htmlFor="cluster-region">Cluster region</label>
						<select
							id="cluster-region"
							className="h-10 max-w-full rounded-md border border-input bg-card px-3 text-sm"
							value={controls.region}
							onChange={event => setControls({ ...controls, region: event.target.value })}
						>
							<option value="">All regions</option>
							{controls.region && !model.regions.includes(controls.region) && (
								<option value={controls.region}>{controls.region}</option>
							)}
							{model.regions.map(region => <option key={region} value={region}>{region}</option>)}
						</select>
						<label className="sr-only" htmlFor="cluster-sort">Sort clusters</label>
						<select
							id="cluster-sort"
							className="h-10 rounded-md border border-input bg-card px-3 text-sm"
							value={controls.sort}
							onChange={event => setControls({ ...controls, sort: event.target.value as ClusterSort })}
						>
							<option value="attention">Sort: Attention first</option>
							<option value="name">Sort: Name</option>
							<option value="newest">Sort: Newest</option>
						</select>
					</div>
					<div className="mb-4 flex min-h-8 items-center justify-between gap-3 text-xs text-muted-foreground">
						<p role="status">Showing {filteredClusters.length} of {model.items.length} clusters</p>
						{hasFilters && (
							<Button
								size="sm"
								variant="ghost"
								onClick={() => setControls({ ...defaultClusterListControls, sort: controls.sort })}
							>
								Clear filters
							</Button>
						)}
					</div>
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
						{filteredClusters.map(item => <ClusterCard key={item.cluster.id} item={item} />)}
					</div>
					{!filteredClusters.length && (
						<div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
							<Layers className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden="true" />
							<h2 className="text-lg font-medium">{model.items.length ? 'No matching clusters' : 'No clusters yet'}</h2>
							<p className="mt-2 text-sm text-muted-foreground">
								{model.items.length
									? 'Try a different search or clear your filters.'
									: 'Ask an organization administrator to create a cluster.'}
							</p>
							{hasFilters && (
								<Button
									className="mt-4"
									variant="outline"
									onClick={() => setControls({ ...defaultClusterListControls, sort: controls.sort })}
								>
									Reset filters
								</Button>
							)}
						</div>
					)}
				</div>
			</OrgPageLayout>
		</>
	);
}

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RegionFormModal } from '@/features/admin/regions/components/RegionFormModal';
import { formatOrgLabel, getOrganizationsQueryOptions } from '@/features/admin/regions/queries/getOrganizations';
import { getRegionsQueryOptions } from '@/features/admin/regions/queries/getRegions';
import { AdminRegion } from '@/integrations/api/api.patch';
import { useQuery } from '@tanstack/react-query';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

export function RegionScope(
	{ organizationIds, orgNameById }: { organizationIds?: string[] | null; orgNameById: Map<string, string> },
) {
	// Only a non-empty list restricts a region (isRegionVisibleToOrg); null and [] are both public.
	if (organizationIds == null || organizationIds.length === 0) {
		return <>Public</>;
	}
	return (
		<div className="flex flex-col gap-0.5">
			{organizationIds.map((id) => (
				<span key={id} className="break-words">{formatOrgLabel(id, orgNameById.get(id))}</span>
			))}
		</div>
	);
}

export function RegionsIndex() {
	const { data: regions, isLoading, isError } = useQuery(getRegionsQueryOptions());
	const { data: organizations = [] } = useQuery(getOrganizationsQueryOptions());
	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState<AdminRegion | null>(null);
	const [search, setSearch] = useState('');

	const orgNameById = useMemo(() => new Map(organizations.map((o) => [o.id, o.name])), [organizations]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q || !regions) { return regions ?? []; }
		return regions.filter((r) =>
			r.region.toLowerCase().includes(q)
			|| r.id.toLowerCase().includes(q)
			|| r.latencyDescription.toLowerCase().includes(q)
			|| (r.organizationIds ?? []).some((id) =>
				id.toLowerCase().includes(q) || (orgNameById.get(id) ?? '').toLowerCase().includes(q)
			)
		);
	}, [regions, search, orgNameById]);

	const openCreate = () => {
		setEditing(null);
		setModalOpen(true);
	};
	const openEdit = (region: AdminRegion) => {
		setEditing(region);
		setModalOpen(true);
	};

	return (
		<div className="max-w-4xl">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-light">Regions</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Deployment regions customers can provision into. A region scoped to organizations is only offered to those
						customers; otherwise it's available to everyone.
					</p>
				</div>
				<Button variant="submit" onClick={openCreate} className="shrink-0">
					<PlusIcon />
					Create region
				</Button>
			</div>

			<div className="mt-6">
				{isLoading
					? <p className="text-sm text-muted-foreground">Loading regions…</p>
					: isError
					? <p className="text-sm text-destructive">Couldn't load regions.</p>
					: !regions || regions.length === 0
					? <p className="text-sm text-muted-foreground">No regions yet. Create one to get started.</p>
					: (
						<>
							<Input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Filter by ID, region, description, or organization…"
								aria-label="Filter regions"
								className="mb-4 max-w-md"
							/>
							{filtered.length === 0
								? <p className="text-sm text-muted-foreground">No regions match “{search}”.</p>
								: (
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>ID</TableHead>
												<TableHead>Region</TableHead>
												<TableHead className="text-right pr-6">Instances</TableHead>
												<TableHead>Description</TableHead>
												<TableHead>Scope</TableHead>
												<TableHead className="w-0" />
											</TableRow>
										</TableHeader>
										<TableBody>
											{filtered.map((region) => (
												<TableRow key={region.id} className={region.active === false ? 'opacity-60' : undefined}>
													<TableCell className="font-mono font-medium">
														<span className="inline-flex items-center gap-2">
															{region.id}
															{region.active === false && (
																<Badge variant="secondary" className="text-[10px]">Inactive</Badge>
															)}
														</span>
													</TableCell>
													<TableCell>{region.region}</TableCell>
													<TableCell className="text-right pr-6">{region.instanceCount}</TableCell>
													<TableCell className="text-muted-foreground">{region.latencyDescription}</TableCell>
													<TableCell>
														<RegionScope organizationIds={region.organizationIds} orgNameById={orgNameById} />
													</TableCell>
													<TableCell className="text-right">
														<Button
															variant="ghost"
															size="icon"
															aria-label={`Edit ${region.id}`}
															onClick={() =>
																openEdit(region)}
														>
															<PencilIcon />
														</Button>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								)}
						</>
					)}
			</div>

			<RegionFormModal open={modalOpen} onOpenChange={setModalOpen} region={editing} />
		</div>
	);
}

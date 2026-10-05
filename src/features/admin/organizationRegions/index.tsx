import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OrganizationRegionFormModal } from '@/features/admin/organizationRegions/components/OrganizationRegionFormModal';
import { getOrganizationRegionsQueryOptions } from '@/features/admin/organizationRegions/queries/getOrganizationRegions';
import { formatOrgLabel, getOrganizationsQueryOptions } from '@/features/admin/regions/queries/getOrganizations';
import { describeShape } from '@/features/clusters/upsert/lib/regionLookup';
import { useStaffPermission } from '@/hooks/useAuth';
import { OrganizationRegion } from '@/integrations/api/api.patch';
import { useQuery } from '@tanstack/react-query';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

function PlacementSummary({ placement }: { placement: OrganizationRegion['placement'] }) {
	const lines = [
		placement?.linode?.length ? `Linode: ${describeShape(placement.linode)}` : null,
		placement?.gcp?.length ? `GCP: ${describeShape(placement.gcp)}` : null,
	].filter((line): line is string => line !== null);
	return (
		<div className="flex flex-col gap-0.5">
			{lines.map((line) => <span key={line} className="font-mono text-xs">{line}</span>)}
		</div>
	);
}

export function OrganizationRegionsIndex() {
	const [organizationId, setOrganizationId] = useState<string>('');
	const { data: orgResult, isLoading: orgsLoading } = useQuery(getOrganizationsQueryOptions());
	const { data: regions, isLoading, isError } = useQuery(getOrganizationRegionsQueryOptions(organizationId || undefined));
	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState<OrganizationRegion | null>(null);
	const canWriteRegions = useStaffPermission('region:write');

	const organizations = orgResult?.organizations ?? [];

	const openCreate = () => {
		setEditing(null);
		setModalOpen(true);
	};
	const openEdit = (region: OrganizationRegion) => {
		setEditing(region);
		setModalOpen(true);
	};

	return (
		<div className="max-w-4xl">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-light">Custom regions</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Placement shapes owned by one organization: the datacenters one unit occupies. Every cluster in the
						organization can deploy one, choosing how many units it wants. Internal only — customers never see these.
					</p>
				</div>
				{canWriteRegions && organizationId && (
					<Button variant="submit" onClick={openCreate} className="shrink-0">
						<PlusIcon />
						Create custom region
					</Button>
				)}
			</div>

			<div className="mt-6 max-w-md">
				<Select value={organizationId} onValueChange={setOrganizationId} disabled={orgsLoading}>
					<SelectTrigger className="w-full" aria-label="Organization">
						<SelectValue placeholder={orgsLoading ? 'Loading organizations…' : 'Choose an organization'} />
					</SelectTrigger>
					<SelectContent>
						{organizations.map((o) => <SelectItem key={o.id} value={o.id}>{formatOrgLabel(o.id, o.name)}</SelectItem>)}
					</SelectContent>
				</Select>
				{orgResult?.truncated && (
					<p className="mt-1 text-xs text-destructive">
						Too many organizations to list them all — some may be missing from this picker.
					</p>
				)}
			</div>

			<div className="mt-6">
				{!organizationId
					? <p className="text-sm text-muted-foreground">Choose an organization to see its custom regions.</p>
					: isLoading
					? <p className="text-sm text-muted-foreground">Loading custom regions…</p>
					: isError
					? <p className="text-sm text-destructive">Couldn't load custom regions.</p>
					: !regions || regions.length === 0
					? <p className="text-sm text-muted-foreground">No custom regions yet for this organization.</p>
					: (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Datacenters per unit</TableHead>
									<TableHead>Fallback pool</TableHead>
									<TableHead className="w-0" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{regions.map((region) => (
									<TableRow key={region.id} className={region.active === false ? 'opacity-60' : undefined}>
										<TableCell className="font-medium">
											<span className="inline-flex items-center gap-2">
												{region.name}
												{region.active === false && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
											</span>
											<div className="font-mono text-xs text-muted-foreground">{region.id}</div>
										</TableCell>
										<TableCell>
											<PlacementSummary placement={region.placement} />
										</TableCell>
										<TableCell className="text-muted-foreground">{region.fallbackGroup ?? 'None (forced)'}</TableCell>
										<TableCell className="text-right">
											{canWriteRegions && (
												<Button variant="ghost" size="icon" aria-label={`Edit ${region.name}`} onClick={() => openEdit(region)}>
													<PencilIcon />
												</Button>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
			</div>

			{organizationId && (
				<OrganizationRegionFormModal
					open={modalOpen}
					onOpenChange={setModalOpen}
					organizationId={organizationId}
					region={editing}
				/>
			)}
		</div>
	);
}

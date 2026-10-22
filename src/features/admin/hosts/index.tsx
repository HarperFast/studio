import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
	AdminHostFilters,
	ALL_STATUSES,
	getHostsQueryOptions,
	HostStatusFilter,
	RUNNING_OR_DEGRADED,
} from '@/features/admin/hosts/queries/getHosts';
import { getLocationsQueryOptions } from '@/features/admin/regions/queries/getLocations';
import {
	AdminOrganizationSummary,
	formatOrgLabel,
	getOrganizationsQueryOptions,
} from '@/features/admin/regions/queries/getOrganizations';
import { useStaffPermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { AdminHost, HostStatus } from '@/integrations/api/api.patch';
import { detectEntityId } from '@/lib/string/entityId';
import { useQuery } from '@tanstack/react-query';
import { ReactNode, useMemo, useState } from 'react';

const ANY = 'any';
const STATUS_OPTIONS: Array<{ value: HostStatusFilter; label: string }> = [
	{ value: 'RUNNING', label: 'Running' },
	{ value: RUNNING_OR_DEGRADED, label: 'Running + degraded' },
	{ value: 'DEGRADED', label: 'Degraded' },
	{ value: 'PROVISIONING', label: 'Provisioning' },
	{ value: 'REMOVING', label: 'Removing' },
	{ value: 'REMOVED', label: 'Removed' },
	{ value: 'TERMINATED', label: 'Terminated' },
	{ value: ALL_STATUSES, label: 'All statuses' },
];
const STATUS_BADGE: Record<HostStatus, 'success' | 'warning' | 'secondary' | 'outline'> = {
	RUNNING: 'success',
	DEGRADED: 'warning',
	PROVISIONING: 'secondary',
	REMOVING: 'secondary',
	REMOVED: 'outline',
	TERMINATED: 'outline',
};

export type OrganizationPick = { id: string } | { ambiguous: number } | { unresolved: true };

/**
 * Names are not unique, so a bare name resolves only when one organization has it. A pasted id is accepted
 * without the directory, which accounts without org:read never load.
 */
export function resolveOrganization(text: string, organizations: AdminOrganizationSummary[]): OrganizationPick | null {
	const trimmed = text.trim();
	if (!trimmed) { return null; }
	const exact = organizations.find((org) => org.id === trimmed || formatOrgLabel(org.id, org.name) === trimmed);
	if (exact) { return { id: exact.id }; }
	const lower = trimmed.toLowerCase();
	const named = organizations.filter((org) => org.name?.toLowerCase() === lower);
	if (named.length === 1) { return { id: named[0].id }; }
	if (named.length > 1) { return { ambiguous: named.length }; }
	const pasted = detectEntityId(trimmed);
	return pasted?.kind === 'organization' ? { id: pasted.id } : { unresolved: true };
}

export type DirectoryState = 'complete' | 'loading' | 'failed' | 'truncated' | 'unavailable';

/** "No match" is only true of a directory that fully loaded; otherwise a pasted id is the way through. */
export function describeUnresolvedOrganization(text: string, directory: DirectoryState): string {
	switch (directory) {
		case 'complete':
			return `No organization matches “${text}”.`;
		case 'loading':
			return 'The organization list is still loading. Paste an org- id to filter now.';
		case 'failed':
			return "Couldn't load the organization list. Paste an org- id to filter.";
		case 'truncated':
			return `“${text}” isn't among the organizations loaded. Paste its org- id.`;
		case 'unavailable':
			return 'Enter an organization id (org-…).';
	}
}

export function hostMatchesSearch(host: AdminHost, search: string): boolean {
	const query = search.trim().toLowerCase();
	if (!query) { return true; }
	return [host.name, host.id, host.fqdn, host.ipAddress, host.cloudInstanceId].some((value) =>
		value?.toLowerCase().includes(query)
	);
}

// Central-manager stores -1 when a host's report left the value out.
function reported(value: number | null): number | null {
	return value != null && value >= 0 ? value : null;
}

export function formatUsage(used: number | null, max: number | null, divisor = 1): string {
	if (max == null) { return '—'; }
	const format = (value: number) => Number((value / divisor).toFixed(1)).toString();
	const value = reported(used);
	return `${value == null ? '?' : format(value)} / ${format(max)}`;
}

/** `usedCPUCores` is the cores busy during the host's last 100 ms sample, not an allocation. */
export function formatCpu(used: number | null, max: number | null): string {
	if (max == null || max <= 0) { return '—'; }
	const value = reported(used);
	return `${value == null ? '?' : `${Math.round((value / max) * 100)}%`} of ${max} cores`;
}

function HostOrganizations(
	{ host, orgNameById }: { host: AdminHost; orgNameById: Map<string, string> },
) {
	const dedicated = host.organizationIds ?? [];
	if (dedicated.length === 0) { return <span className="text-muted-foreground">Shared</span>; }
	return (
		<div className="flex flex-col gap-0.5">
			{dedicated.map((id) => <span key={id}>{formatOrgLabel(id, orgNameById.get(id))}</span>)}
		</div>
	);
}

function hostFlags(host: AdminHost): string[] {
	const flags: string[] = [];
	if (host.gpu) {
		flags.push(['GPU', host.gpuCount && `${host.gpuCount}×`, host.gpuType].filter(Boolean).join(' '));
	}
	if (host.underMaintenance) { flags.push('Maintenance'); }
	if (host.embedHub) { flags.push('Embed hub'); }
	if (host.canaryHost) { flags.push('Canary'); }
	return flags;
}

function HostFlags({ host }: { host: AdminHost }) {
	const flags = hostFlags(host);
	if (flags.length === 0) { return null; }
	return (
		<span className="flex flex-wrap gap-1">
			{flags.map((flag) => <Badge key={flag} variant="secondary" className="text-[10px]">{flag}</Badge>)}
		</span>
	);
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[9rem_1fr] gap-3 text-sm">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="min-w-0 break-words">{children}</dd>
		</div>
	);
}

function HostDetails(
	{ host, orgNameById, onClose }: {
		host: AdminHost | null;
		orgNameById: Map<string, string>;
		onClose: () => void;
	},
) {
	return (
		<Sheet open={host !== null} onOpenChange={(open) => !open && onClose()}>
			<SheetContent className="w-full overflow-y-auto sm:max-w-lg">
				{host && (
					<>
						<SheetHeader>
							<SheetTitle>{host.name}</SheetTitle>
							<SheetDescription className="font-mono">{host.id}</SheetDescription>
						</SheetHeader>
						<dl className="flex flex-col gap-2 px-4">
							<DetailRow label="Status">{host.status ?? '—'}</DetailRow>
							<DetailRow label="FQDN">{host.fqdn ?? '—'}</DetailRow>
							<DetailRow label="IP address">{host.ipAddress ?? '—'}</DetailRow>
							<DetailRow label="Location">
								{[host.locationName, [host.location, host.cloudProvider].filter(Boolean).join(' · ')]
									.filter(Boolean)
									.join(' — ') || host.locationId || '—'}
							</DetailRow>
							<DetailRow label="Regions">{host.regions.join(', ') || '—'}</DetailRow>
							<DetailRow label="Cloud instance">
								{[host.cloudInstanceType, host.cloudInstanceId].filter(Boolean).join(' · ') || '—'}
							</DetailRow>
							<DetailRow label="Organizations">
								<HostOrganizations host={host} orgNameById={orgNameById} />
							</DetailRow>
							<DetailRow label="Dynamically assignable">
								{host.dynamicallyAssignable == null ? '—' : host.dynamicallyAssignable ? 'Yes' : 'No'}
							</DetailRow>
							{hostFlags(host).length > 0 && (
								<DetailRow label="Flags">
									<HostFlags host={host} />
								</DetailRow>
							)}
							<DetailRow label="CPU">{formatCpu(host.usedCPUCores, host.maxCPUCores)}</DetailRow>
							<DetailRow label="Memory (GB)">{formatUsage(host.usedMemoryMb, host.maxMemoryMb, 1024)}</DetailRow>
							<DetailRow label="Disk (GB)">{formatUsage(host.usedStorageGb, host.maxStorageGb)}</DetailRow>
							<DetailRow label="Created">{host.createdAt ?? '—'}</DetailRow>
							{host.terminatedAt && <DetailRow label="Terminated">{host.terminatedAt}</DetailRow>}
						</dl>
						<section className="px-4 pb-6">
							<h3 className="mb-2 text-sm font-medium">Organizations with instances here</h3>
							{host.organizations.length === 0
								? <p className="text-sm text-muted-foreground">None.</p>
								: (
									<ul className="flex flex-col gap-1 text-sm">
										{host.organizations.map((org) => (
											<li key={org.id} className="flex justify-between gap-4">
												<span className="min-w-0 break-words">{formatOrgLabel(org.id, orgNameById.get(org.id))}</span>
												<span className="shrink-0 text-muted-foreground">
													{org.instanceCount} {org.instanceCount === 1 ? 'instance' : 'instances'}
												</span>
											</li>
										))}
									</ul>
								)}
						</section>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}

export function HostsIndex() {
	const [status, setStatus] = useState<HostStatusFilter>('RUNNING');
	const [organizationText, setOrganizationText] = useState('');
	const [cloudProvider, setCloudProvider] = useState(ANY);
	const [locationId, setLocationId] = useState(ANY);
	const [region, setRegion] = useState(ANY);
	const [search, setSearch] = useState('');
	const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
	const debouncedOrganizationText = useDebounce(organizationText, 300);

	// The directory endpoint needs org:read, which this page's host:read does not imply.
	const canReadOrganizations = useStaffPermission('org:read');
	const { data: orgResult, isError: organizationsFailed } = useQuery({
		...getOrganizationsQueryOptions(),
		enabled: canReadOrganizations,
	});
	const directory: DirectoryState = !canReadOrganizations
		? 'unavailable'
		: organizationsFailed
		? 'failed'
		: !orgResult
		? 'loading'
		: orgResult.truncated
		? 'truncated'
		: 'complete';
	const { data: locations } = useQuery(getLocationsQueryOptions());
	const organizations = useMemo(() => orgResult?.organizations ?? [], [orgResult]);
	const orgNameById = useMemo(() => new Map(organizations.map((o) => [o.id, o.name])), [organizations]);
	const organizationOptions = useMemo(
		() => organizations.map((org) => <option key={org.id} value={formatOrgLabel(org.id, org.name)} />),
		[organizations],
	);

	const organizationPick = useMemo(
		() => resolveOrganization(debouncedOrganizationText, organizations),
		[debouncedOrganizationText, organizations],
	);
	const organizationProblem = organizationPick && !('id' in organizationPick)
		? 'ambiguous' in organizationPick
			? `${organizationPick.ambiguous} organizations are named “${debouncedOrganizationText.trim()}” — pick one from the list.`
			: describeUnresolvedOrganization(debouncedOrganizationText.trim(), directory)
		: null;

	const filters: AdminHostFilters = {
		status,
		organizationId: organizationPick && 'id' in organizationPick ? organizationPick.id : undefined,
		cloudProvider: cloudProvider === ANY ? undefined : cloudProvider,
		locationId: locationId === ANY ? undefined : locationId,
		region: region === ANY ? undefined : region,
	};
	const { data: hosts, isLoading, isError } = useQuery({
		...getHostsQueryOptions(filters),
		enabled: organizationProblem === null,
	});
	const selectedHost = hosts?.find((host) => host.id === selectedHostId) ?? null;
	const visible = useMemo(
		() => (search.trim() ? (hosts ?? []).filter((host) => hostMatchesSearch(host, search)) : hosts ?? []),
		[hosts, search],
	);

	const locationOptions = useMemo(
		() =>
			(locations ?? [])
				.filter((location) => cloudProvider === ANY || location.cloudProvider === cloudProvider)
				.sort((a, b) => a.locationName.localeCompare(b.locationName)),
		[locations, cloudProvider],
	);
	const regionOptions = useMemo(
		() => [...new Set((locations ?? []).flatMap((location) => location.regions))].sort(),
		[locations],
	);

	const changeProvider = (provider: string) => {
		setCloudProvider(provider);
		const selected = locations?.find((location) => location.id === locationId);
		if (provider !== ANY && selected && selected.cloudProvider !== provider) { setLocationId(ANY); }
	};

	return (
		<div>
			<h1 className="text-2xl font-light">Hosts</h1>
			<p className="mt-2 text-sm text-muted-foreground max-w-3xl">
				Hosts in the fleet, running ones unless you pick another status. An organization filter finds the hosts
				dedicated to it and the shared hosts its instances run on.
			</p>

			<div className="mt-6 flex flex-wrap gap-2">
				<Select value={status} onValueChange={(value) => setStatus(value as HostStatusFilter)}>
					<SelectTrigger className="w-40" aria-label="Status">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{STATUS_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Input
					value={organizationText}
					onChange={(e) => setOrganizationText(e.target.value)}
					list="admin-host-organizations"
					placeholder="Organization id or name…"
					aria-label="Organization"
					className="w-64"
				/>
				<datalist id="admin-host-organizations">
					{organizationOptions}
				</datalist>
				<Select value={cloudProvider} onValueChange={changeProvider}>
					<SelectTrigger className="w-36" aria-label="Cloud provider">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ANY}>All providers</SelectItem>
						<SelectItem value="linode">Linode</SelectItem>
						<SelectItem value="gcp">GCP</SelectItem>
					</SelectContent>
				</Select>
				<Select value={locationId} onValueChange={setLocationId}>
					<SelectTrigger className="w-56" aria-label="Location">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ANY}>All locations</SelectItem>
						{locationOptions.map((location) => (
							<SelectItem key={location.id} value={location.id}>
								{location.locationName} ({location.location})
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select value={region} onValueChange={setRegion}>
					<SelectTrigger className="w-36" aria-label="Region">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ANY}>All regions</SelectItem>
						{regionOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
					</SelectContent>
				</Select>
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Name, id, FQDN or IP…"
					aria-label="Search hosts"
					className="w-56"
				/>
			</div>

			<div className="mt-4">
				{organizationProblem
					? <p className="text-sm text-muted-foreground">{organizationProblem}</p>
					: isLoading
					? <p className="text-sm text-muted-foreground">Loading hosts…</p>
					: isError
					? <p className="text-sm text-destructive">Couldn't load hosts.</p>
					: visible.length === 0
					? <p className="text-sm text-muted-foreground">No hosts match these filters.</p>
					: (
						<>
							<p className="mb-2 text-xs text-muted-foreground">
								{visible.length === hosts?.length
									? `${visible.length} hosts`
									: `${visible.length} of ${hosts?.length} hosts`}
							</p>
							<div className="overflow-x-auto">
								<Table className="[&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:px-3">
									<TableHeader>
										<TableRow>
											<TableHead>Host</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Location</TableHead>
											<TableHead>Organizations</TableHead>
											<TableHead className="text-right">Instances</TableHead>
											<TableHead
												className="text-right"
												title="Share of the host's cores busy in its last heartbeat sample"
											>
												CPU
											</TableHead>
											<TableHead className="text-right">Memory (GB)</TableHead>
											<TableHead className="text-right">Disk (GB)</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{visible.map((host) => (
											<TableRow
												key={host.id}
												className="cursor-pointer hover:bg-muted/50"
												onClick={() => setSelectedHostId(host.id)}
											>
												<TableCell>
													<div className="flex flex-col gap-1">
														<button
															type="button"
															className="self-start text-left font-medium hover:underline"
															onClick={() => setSelectedHostId(host.id)}
														>
															{host.name}
														</button>
														{host.id !== host.name && (
															<span className="font-mono text-xs text-muted-foreground">{host.id}</span>
														)}
														{(host.fqdn ?? host.ipAddress) && (
															<span className="font-mono text-xs text-muted-foreground">
																{host.fqdn ?? host.ipAddress}
															</span>
														)}
														<HostFlags host={host} />
													</div>
												</TableCell>
												<TableCell>
													{host.status
														? <Badge variant={STATUS_BADGE[host.status] ?? 'outline'}>{host.status}</Badge>
														: <span className="text-muted-foreground">—</span>}
												</TableCell>
												<TableCell>
													{host.location
														? [host.location, host.cloudProvider].filter(Boolean).join(' · ')
														: <span className="text-muted-foreground">{host.locationId ?? '—'}</span>}
												</TableCell>
												<TableCell>
													<HostOrganizations host={host} orgNameById={orgNameById} />
												</TableCell>
												<TableCell className="text-right">{host.instanceCount}</TableCell>
												<TableCell className="text-right whitespace-nowrap">
													{formatCpu(host.usedCPUCores, host.maxCPUCores)}
												</TableCell>
												<TableCell className="text-right whitespace-nowrap">
													{formatUsage(host.usedMemoryMb, host.maxMemoryMb, 1024)}
												</TableCell>
												<TableCell className="text-right whitespace-nowrap">
													{formatUsage(host.usedStorageGb, host.maxStorageGb)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						</>
					)}
			</div>

			<HostDetails host={selectedHost} orgNameById={orgNameById} onClose={() => setSelectedHostId(null)} />
		</div>
	);
}

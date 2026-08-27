import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatOrgLabel, getOrganizationsQueryOptions } from '@/features/admin/regions/queries/getOrganizations';
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ExpiryPolicyPanel } from './components/ExpiryPolicyPanel';
import { getGrantsQueryOptions } from './queries/getGrants';

/** 'any' is the unfiltered state; the ids come off the rows so new sources need no code change. */
const ANY = 'any';

const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const fmtDate = (iso: string | null | undefined) => {
	if (!iso) { return '—'; }
	const at = new Date(iso);
	return Number.isNaN(at.getTime()) ? '—' : dateFmt.format(at);
};

function statusVariant(grant: AdminClusterGrant): 'success' | 'destructive' | 'secondary' | 'warning' {
	// Server-computed liveness beats the stored status when present: an ACTIVE row past its endsAt
	// is not live until the runner stamps it (same rule as the customer surfaces).
	if (grant.isActive === false && grant.status === 'ACTIVE') { return 'warning'; }
	switch (grant.status) {
		case 'ACTIVE':
			return 'success';
		case 'EXPIRED':
			return 'destructive';
		default:
			return 'secondary';
	}
}

/**
 * The next unapplied stage off the server-computed timeline, when central-manager sends one.
 * Nothing is derived locally — studio deliberately holds no expiry offsets (see grantExpiry.ts),
 * so without a timeline the column shows a dash rather than a guess.
 */
function nextDue(grant: AdminClusterGrant): string {
	const next = grant.timeline?.find((entry) => !entry.applied);
	if (!next) { return '—'; }
	return `${next.stage} ${fmtDate(next.dueAt)}`;
}

export function GrantsAdminIndex() {
	const { data: grants, isLoading, isError } = useQuery(getGrantsQueryOptions());
	const { data: orgResult } = useQuery(getOrganizationsQueryOptions());
	const [search, setSearch] = useState('');
	const [source, setSource] = useState(ANY);
	const [status, setStatus] = useState(ANY);

	const orgNameById = useMemo(
		() => new Map((orgResult?.organizations ?? []).map((o) => [o.id, o.name])),
		[orgResult],
	);

	const sources = useMemo(() => [...new Set((grants ?? []).map((g) => g.source))].sort(), [grants]);
	const statuses = useMemo(() => [...new Set((grants ?? []).map((g) => g.status))].sort(), [grants]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return (grants ?? [])
			.filter((g) => source === ANY || g.source === source)
			.filter((g) => status === ANY || g.status === status)
			.filter((g) =>
				!q
				|| g.id.toLowerCase().includes(q)
				|| (g.clusterId ?? '').toLowerCase().includes(q)
				|| g.organizationId.toLowerCase().includes(q)
				|| (orgNameById.get(g.organizationId) ?? '').toLowerCase().includes(q)
				|| (g.currentStage ?? '').toLowerCase().includes(q)
				|| (g.reason ?? '').toLowerCase().includes(q)
			)
			// Soonest-ending first; forever grants (null endsAt) sink to the bottom.
			.sort((a, b) => {
				const at = a.endsAt ? new Date(a.endsAt).getTime() : Infinity;
				const bt = b.endsAt ? new Date(b.endsAt).getTime() : Infinity;
				return at - bt;
			});
	}, [grants, search, source, status, orgNameById]);

	if (isError) {
		return (
			<p className="text-sm text-destructive">
				Could not load grants. You need the <code>grant:read</code> permission to view this page.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-2">
				<h1 className="text-lg font-semibold mr-auto">Grants</h1>
				<Input
					className="w-64"
					placeholder="Search id, cluster, org, reason…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<Select value={source} onValueChange={setSource}>
					<SelectTrigger className="w-36" aria-label="Filter by source">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value={ANY}>Any source</SelectItem>
							{sources.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
						</SelectGroup>
					</SelectContent>
				</Select>
				<Select value={status} onValueChange={setStatus}>
					<SelectTrigger className="w-36" aria-label="Filter by status">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value={ANY}>Any status</SelectItem>
							{statuses.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>

			{isLoading ? <p className="text-sm text-muted-foreground">Loading grants…</p> : (
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Grant</TableHead>
								<TableHead>Organization</TableHead>
								<TableHead>Cluster</TableHead>
								<TableHead>Source</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Stage</TableHead>
								<TableHead>Next due</TableHead>
								<TableHead>Ends</TableHead>
								<TableHead>Reason</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filtered.map((grant) => (
								<TableRow key={grant.id}>
									<TableCell className="font-mono text-xs">{grant.id}</TableCell>
									<TableCell className="break-words">
										{formatOrgLabel(grant.organizationId, orgNameById.get(grant.organizationId))}
									</TableCell>
									<TableCell>
										{grant.clusterId
											? (
												<Link
													className="underline underline-offset-2 hover:no-underline font-mono text-xs"
													to={`/${grant.organizationId}/${grant.clusterId}`}
												>
													{grant.clusterId}
												</Link>
											)
											: <Badge variant="secondary">unbound voucher</Badge>}
									</TableCell>
									<TableCell>{grant.source}</TableCell>
									<TableCell>
										<Badge variant={statusVariant(grant)}>
											{grant.isActive === false && grant.status === 'ACTIVE' ? 'ACTIVE (lapsed)' : grant.status}
										</Badge>
									</TableCell>
									<TableCell>{grant.currentStage ?? '—'}</TableCell>
									<TableCell className="whitespace-nowrap">{nextDue(grant)}</TableCell>
									<TableCell className="whitespace-nowrap">{fmtDate(grant.endsAt)}</TableCell>
									<TableCell className="max-w-64 truncate" title={grant.reason ?? undefined}>
										{grant.reason ?? '—'}
									</TableCell>
								</TableRow>
							))}
							{filtered.length === 0 && (
								<TableRow>
									<TableCell colSpan={9} className="text-center text-muted-foreground">
										No grants match.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			)}

			<ExpiryPolicyPanel />
		</div>
	);
}

import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RevokeStaffApiTokenButton } from '@/features/admin/apiToken/components/RevokeStaffApiTokenButton';
import { StaffUserLabel } from '@/features/admin/apiToken/components/StaffUserLabel';
import { StaffUserSummary } from '@/features/admin/apiToken/queries/staffUsers';
import { StaffApiToken, StaffApiTokenStatus } from '@/integrations/api/api.patch';

const STATUS_BADGES: Record<
	StaffApiTokenStatus,
	{ label: string; variant: 'success' | 'warning' | 'secondary' | 'outline' }
> = {
	active: { label: 'Active', variant: 'success' },
	idle: { label: 'Idle', variant: 'warning' },
	expired: { label: 'Expired', variant: 'secondary' },
	revoked: { label: 'Revoked', variant: 'outline' },
};

function StatusBadge({ status }: { status: StaffApiTokenStatus }) {
	const badge = STATUS_BADGES[status] ?? { label: status, variant: 'outline' };
	return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

function When({ value }: { value: string | null }) {
	if (!value) {
		return <span className="text-muted-foreground">Never</span>;
	}
	return <>{new Date(value).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</>;
}

export function StaffApiTokenTable({ tokens, self }: { tokens: StaffApiToken[]; self: StaffUserSummary }) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-0">
						<span className="sr-only">Actions</span>
					</TableHead>
					<TableHead>Name</TableHead>
					<TableHead>Owner</TableHead>
					<TableHead>Role</TableHead>
					<TableHead>Created by</TableHead>
					<TableHead>Created</TableHead>
					<TableHead>Expires</TableHead>
					<TableHead>Last used</TableHead>
					<TableHead>Status</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{tokens.map((token) => (
					<TableRow key={token.id} className={token.status === 'active' ? undefined : 'opacity-60'}>
						{/* First, so a wide row never scrolls the one control off the screen. */}
						<TableCell className="whitespace-nowrap">
							{token.status === 'active' && <RevokeStaffApiTokenButton token={token} />}
						</TableCell>
						<TableCell className="font-medium">{token.name}</TableCell>
						<TableCell>
							<StaffUserLabel userId={token.ownerUserId} self={self} />
						</TableCell>
						<TableCell className="font-mono text-xs">{token.role}</TableCell>
						<TableCell>
							<StaffUserLabel userId={token.createdByUserId} self={self} />
						</TableCell>
						<TableCell className="whitespace-nowrap">
							<When value={token.createdAt} />
						</TableCell>
						<TableCell className="whitespace-nowrap">
							<When value={token.expiresAt} />
						</TableCell>
						<TableCell className="whitespace-nowrap">
							<When value={token.lastUsedAt} />
						</TableCell>
						<TableCell>
							<StatusBadge status={token.status} />
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

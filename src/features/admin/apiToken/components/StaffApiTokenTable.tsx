import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RevokeStaffApiTokenButton } from '@/features/admin/apiToken/components/RevokeStaffApiTokenButton';
import { StaffUserLabel } from '@/features/admin/apiToken/components/StaffUserLabel';
import { StaffUserSummary } from '@/features/admin/apiToken/queries/staffUsers';
import { StaffApiToken, StaffApiTokenStatus } from '@/integrations/api/api.patch';
import { cn } from '@/lib/cn';

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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** "in 13 days", "2 hours ago": the unit a reader would pick, never seconds. */
export function formatRelative(value: string, now: number): string {
	const diffMs = new Date(value).getTime() - now;
	const abs = Math.abs(diffMs);
	const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
	if (abs >= 2 * DAY_MS) { return format.format(Math.round(diffMs / DAY_MS), 'day'); }
	if (abs >= HOUR_MS) { return format.format(Math.round(diffMs / HOUR_MS), 'hour'); }
	return format.format(Math.round(diffMs / 60000), 'minute');
}

function formatStamp(value: string): string {
	return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// Columns leave as the viewport narrows, least-read first; the owner folds under the token name
// below `lg`; Revoke, Expires and Status always stay, and nothing has to scroll sideways.
const OWNER_COLUMN = 'hidden lg:table-cell';
const CREATED_COLUMN = 'hidden 2xl:table-cell';
const LAST_USED_COLUMN = 'hidden xl:table-cell';

/** A timestamp with its relative reading underneath, or a quiet dash. */
function When({ value, now, relative = true }: { value: string | null; now: number; relative?: boolean }) {
	if (!value) {
		return <span className="text-muted-foreground">—</span>;
	}
	return (
		<div className="flex flex-col leading-tight">
			<span className="sm:whitespace-nowrap">{formatStamp(value)}</span>
			{relative && <span className="text-xs text-muted-foreground whitespace-nowrap">{formatRelative(value, now)}
			</span>}
		</div>
	);
}

export function StaffApiTokenTable({ tokens, self }: { tokens: StaffApiToken[]; self: StaffUserSummary }) {
	const now = Date.now();
	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="w-0 pl-3 pr-0">
							<span className="sr-only">Actions</span>
						</TableHead>
						<TableHead>Token</TableHead>
						<TableHead className={OWNER_COLUMN}>Owner</TableHead>
						<TableHead className={CREATED_COLUMN}>Created</TableHead>
						<TableHead>Expires</TableHead>
						<TableHead className={LAST_USED_COLUMN}>Last used</TableHead>
						<TableHead>Status</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{tokens.map((token) => {
						const live = token.status === 'active';
						return (
							<TableRow key={token.id} className={cn('align-top', !live && 'text-muted-foreground')}>
								{/* First, so a wide row never scrolls the one control off the screen. */}
								<TableCell className="pl-2 pr-0 py-2 sm:pl-3">
									{live && <RevokeStaffApiTokenButton token={token} />}
								</TableCell>
								<TableCell className="py-2.5 whitespace-normal">
									<div className="flex flex-col gap-0.5 leading-tight">
										<span className={cn('font-medium break-words', live && 'text-foreground')}>{token.name}</span>
										<span className="font-mono text-xs text-muted-foreground">{token.role}</span>
										<span className="text-xs text-muted-foreground break-words lg:hidden">
											<StaffUserLabel userId={token.ownerUserId} self={self} />
										</span>
									</div>
								</TableCell>
								<TableCell className={cn('py-2.5 whitespace-normal break-words', OWNER_COLUMN)}>
									<div className="flex flex-col gap-0.5 leading-tight">
										<span className={cn(live && 'text-foreground')}>
											<StaffUserLabel userId={token.ownerUserId} self={self} />
										</span>
										{token.createdByUserId !== token.ownerUserId && (
											<span className="text-xs text-muted-foreground">
												minted by <StaffUserLabel userId={token.createdByUserId} self={self} />
											</span>
										)}
									</div>
								</TableCell>
								<TableCell className={cn('py-2.5 whitespace-normal', CREATED_COLUMN)}>
									<When value={token.createdAt} now={now} relative={false} />
								</TableCell>
								<TableCell className="py-2.5 whitespace-normal">
									<When value={token.expiresAt} now={now} relative={live} />
								</TableCell>
								<TableCell className={cn('py-2.5 whitespace-normal', LAST_USED_COLUMN)}>
									<When value={token.lastUsedAt} now={now} relative={live} />
								</TableCell>
								<TableCell className="py-2.5 whitespace-normal">
									<StatusBadge status={token.status} />
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}

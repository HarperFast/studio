import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StaffApiTokenRowMenu } from '@/features/admin/apiToken/components/StaffApiTokenRowMenu';
import { StaffUserCell } from '@/features/admin/apiToken/components/StaffUserCell';
import { StaffUserSummary } from '@/features/admin/apiToken/queries/staffUsers';
import { StaffApiToken, StaffApiTokenRole, StaffApiTokenStatus } from '@/integrations/api/api.patch';
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

/** Reach, as a dot: cool for read-only, warmer as the role widens. */
const ROLE_DOTS: Record<StaffApiTokenRole, string> = {
	fabric_readonly: 'bg-sky-500',
	fabric_support: 'bg-amber-500',
	fabric_staff: 'bg-violet-500',
	fabric_admin: 'bg-red-500',
};

function RoleDot({ role }: { role: StaffApiTokenRole }) {
	return (
		<span className="inline-flex items-center gap-2 whitespace-nowrap">
			<span className={cn('size-2 shrink-0 rounded-sm', ROLE_DOTS[role] ?? 'bg-muted-foreground')} aria-hidden />
			<span className="font-mono text-xs">{role}</span>
		</span>
	);
}

/** `sat-amxi…hko4`: enough to match against a log line, short enough for a column. */
export function maskTokenId(id: string): string {
	return id.length <= 14 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
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

function formatDay(value: string): string {
	return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** A date with its relative reading underneath, or a quiet dash. */
function When({ value, now, relative = true }: { value: string | null; now: number; relative?: boolean }) {
	if (!value) {
		return <span className="text-muted-foreground">—</span>;
	}
	return (
		<div className="flex flex-col leading-tight">
			<span className="sm:whitespace-nowrap">{formatDay(value)}</span>
			{relative && <span className="text-xs text-muted-foreground whitespace-nowrap">{formatRelative(value, now)}
			</span>}
		</div>
	);
}

// Columns leave as the viewport narrows, least-read first; the owner folds under the token name
// below `lg` and the role below `md`. Token, Expires, Status and the row menu always stay, so nothing
// scrolls sideways.
const ROLE_COLUMN = 'hidden md:table-cell';
const OWNER_COLUMN = 'hidden lg:table-cell';
const LAST_USED_COLUMN = 'hidden xl:table-cell';
const CREATED_COLUMN = 'hidden 2xl:table-cell';

export function StaffApiTokenTable({ tokens, self }: { tokens: StaffApiToken[]; self: StaffUserSummary }) {
	const now = Date.now();
	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="pl-4 pr-3">Token</TableHead>
						<TableHead className={cn('px-3', OWNER_COLUMN)}>Owner</TableHead>
						<TableHead className={cn('px-3', ROLE_COLUMN)}>Role</TableHead>
						<TableHead className="px-3">Expires</TableHead>
						<TableHead className={cn('px-3', LAST_USED_COLUMN)}>Last used</TableHead>
						<TableHead className={cn('px-3', CREATED_COLUMN)}>Created</TableHead>
						<TableHead className="px-3">Status</TableHead>
						<TableHead className="w-0 pr-3">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{tokens.map((token) => {
						const live = token.status === 'active';
						return (
							<TableRow key={token.id} className={cn(!live && 'text-muted-foreground')}>
								<TableCell className="py-2.5 pl-4 pr-3 whitespace-normal">
									<div className="flex flex-col gap-1 leading-tight">
										<span className={cn('font-medium break-words', live && 'text-foreground')}>{token.name}</span>
										<span className="font-mono text-xs text-muted-foreground" title={token.id}>
											{maskTokenId(token.id)}
										</span>
										<span className="md:hidden">
											<RoleDot role={token.role} />
										</span>
										<div className="pt-1 lg:hidden">
											<StaffUserCell userId={token.ownerUserId} self={self} muted={!live} />
										</div>
									</div>
								</TableCell>
								<TableCell className={cn('py-2.5 px-3 whitespace-normal', OWNER_COLUMN)}>
									<StaffUserCell userId={token.ownerUserId} self={self} muted={!live} />
								</TableCell>
								<TableCell className={cn('py-2.5 px-3', ROLE_COLUMN)}>
									<RoleDot role={token.role} />
								</TableCell>
								<TableCell className="py-2.5 px-3 whitespace-normal">
									<When value={token.expiresAt} now={now} relative={live} />
								</TableCell>
								<TableCell className={cn('py-2.5 px-3 whitespace-normal', LAST_USED_COLUMN)}>
									<When value={token.lastUsedAt} now={now} relative={live} />
								</TableCell>
								<TableCell className={cn('py-2.5 px-3 whitespace-normal', CREATED_COLUMN)}>
									<StaffUserCell
										userId={token.createdByUserId}
										self={self}
										muted={!live}
										detail={formatDay(token.createdAt)}
									/>
								</TableCell>
								<TableCell className="py-2.5 px-3">
									<StatusBadge status={token.status} />
								</TableCell>
								<TableCell className="py-2 pr-3 text-right">
									<StaffApiTokenRowMenu token={token} />
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}

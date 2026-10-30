import { MembershipDetails } from '@/features/admin/users/userAdminApi';
import { cn } from '@/lib/cn';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { Link } from '@tanstack/react-router';
import { Building2Icon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';

const STATUS_DOT: Record<string, string> = {
	RUNNING: 'bg-green',
	FAILED: 'bg-red-600',
	STOPPED: 'bg-muted-foreground/40',
};

const statusDot = (status: string | null) => STATUS_DOT[status ?? ''] ?? 'animate-pulse bg-yellow';

const statusLabel = (status: string | null) =>
	status ? status.charAt(0) + status.slice(1).toLowerCase().replaceAll('_', ' ') : 'Unknown';

export const organizationLabel = (membership: { organizationName: string | null; organizationId: string }) =>
	membership.organizationName || membership.organizationId;

export function OrganizationCard({ membership }: { membership: MembershipDetails }) {
	const [open, setOpen] = useState(true);
	const { organizationId, clusters } = membership;
	const running = clusters.filter((cluster) => cluster.status === 'RUNNING').length;
	const label = organizationLabel(membership);

	return (
		<li className="overflow-hidden rounded-xl border bg-card">
			<div className="flex items-center gap-3 px-4 py-3">
				{clusters.length
					? (
						<button
							type="button"
							aria-expanded={open}
							aria-label={`${open ? 'Hide' : 'Show'} the clusters of ${label}`}
							onClick={() => setOpen(!open)}
							className="flex cursor-pointer items-center text-muted-foreground hover:text-foreground"
						>
							<ChevronRightIcon className={cn('size-4 transition-transform', open && 'rotate-90')} />
						</button>
					)
					: <span className="size-4" aria-hidden />}
				<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
					<Building2Icon className="size-4" />
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<Link to={buildAbsoluteLinkToPage({ organizationId })} className="truncate font-medium hover:underline">
							{label}
						</Link>
						{membership.roleNames.map((role) => (
							<span key={role} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
								{role}
							</span>
						))}
					</div>
					<p className="mt-0.5 truncate text-xs text-muted-foreground">
						{clusters.length === 1 ? '1 live cluster' : `${clusters.length} live clusters`}
						{clusters.length > 0 && ` · ${running} running`}
						<span className="hidden font-mono text-muted-foreground/70 sm:inline">{' · '}{organizationId}</span>
					</p>
				</div>
			</div>
			{open && clusters.length > 0 && (
				<ul className="divide-y border-t">
					{clusters.map((cluster) => (
						<li
							key={cluster.id}
							className="relative flex items-center gap-3 py-2.5 pr-4 pl-4 text-sm transition-colors hover:bg-accent/40 sm:pl-[5.75rem]"
						>
							<span aria-hidden className={cn('size-2 shrink-0 rounded-full', statusDot(cluster.status))} />
							<Link
								to={buildAbsoluteLinkToPage({ organizationId, clusterId: cluster.id })}
								className="min-w-0 flex-1 truncate after:absolute after:inset-0"
							>
								{cluster.name}
							</Link>
							<span className="hidden font-mono text-[11px] text-muted-foreground/70 sm:inline">{cluster.id}</span>
							<span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
								{statusLabel(cluster.status)}
							</span>
						</li>
					))}
				</ul>
			)}
		</li>
	);
}

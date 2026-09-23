import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { isLocalStudio } from '@/config/constants';
import { getOrganizationTargets } from '@/features/organizations/lib/organizationTargets';
import { useCloudAuth } from '@/hooks/useAuth';
import type { LocalUser, User } from '@/integrations/api/api.patch';
import { Link, useParams } from '@tanstack/react-router';
import { Building2, Check, ChevronDown } from 'lucide-react';

export function OrganizationMenuItems({ user }: { user: User | LocalUser | null }) {
	const { organizationId } = useParams({ strict: false });
	const targets = getOrganizationTargets(user).filter(target => !target.locked);
	return (
		<>
			<DropdownMenuLabel>Your organizations</DropdownMenuLabel>
			<div className="max-h-64 overflow-y-auto">
				{targets.map(target => (
					<DropdownMenuItem key={target.id} asChild>
						<Link
							to={`/${target.id}`}
							className="flex items-center gap-2"
							aria-current={organizationId === target.id ? 'page' : undefined}
						>
							<Building2 className="size-4 shrink-0" />
							<span className="min-w-0 flex-1 truncate" title={target.name}>{target.name}</span>
							{organizationId === target.id && <Check className="size-4" aria-hidden="true" />}
						</Link>
					</DropdownMenuItem>
				))}
			</div>
			<DropdownMenuSeparator />
			<DropdownMenuItem asChild>
				<Link to="/">All organizations</Link>
			</DropdownMenuItem>
		</>
	);
}

export function OrganizationSwitcher() {
	const { user } = useCloudAuth();
	const { organizationId } = useParams({ strict: false });
	if (isLocalStudio || !organizationId) { return null; }
	const targets = getOrganizationTargets(user);
	const current = targets.find(target => target.id === organizationId);
	const label = current?.name ?? organizationId;
	const canSwitch = targets.some(target => !target.locked && target.id !== organizationId);
	const content = (
		<>
			<Building2 className="size-4 shrink-0 text-primary" />
			<span className="min-w-0 flex-1 truncate text-left" title={label}>{label}</span>
		</>
	);
	if (!canSwitch) {
		return (
			<Link
				to={`/${organizationId}`}
				className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-3 text-sm font-semibold"
			>
				{content}
			</Link>
		);
	}
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className="mb-4 flex w-full items-center gap-2 rounded-lg border border-primary/20 bg-card/40 px-3 py-3 text-sm font-semibold hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring"
				aria-label={`Switch organization, current: ${label}`}
			>
				{content}
				<ChevronDown className="size-4 shrink-0" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				<OrganizationMenuItems user={user} />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

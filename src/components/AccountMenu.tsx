import { OrganizationMenuItems } from '@/components/OrganizationSwitcher';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { isLocalStudio } from '@/config/constants';
import { canSeeAdminSection } from '@/features/admin/components/AdminShell';
import { getOrganizationTargets } from '@/features/organizations/lib/organizationTargets';
import { useTheme } from '@/hooks/useTheme';
import type { LocalUser, User } from '@/integrations/api/api.patch';
import { isLocalUser } from '@/lib/types/isLocalUser';
import { Link, useParams } from '@tanstack/react-router';
import { Building2, ChevronDown, LogOut, Palette, Shield, UserRound } from 'lucide-react';
import { useMemo } from 'react';

export function AccountMenu(
	{ user, onSignOut, signingOut }: { user: User | LocalUser; onSignOut: () => void; signingOut: boolean },
) {
	const [theme, setTheme] = useTheme();
	const { organizationId } = useParams({ strict: false });
	const local = isLocalStudio || isLocalUser(user);
	const name = isLocalUser(user)
		? user.username
		: [user.firstname, user.lastname].filter(Boolean).join(' ') || user.email;
	const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
	const canSwitch = useMemo(
		() => getOrganizationTargets(user).some(target => !target.locked && target.id !== organizationId),
		[user, organizationId],
	);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label="Account menu"
				className="ml-2 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-card/50 p-1 pr-2 text-foreground hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-ring"
			>
				<span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary dark:text-violet-200">
					{initials || <UserRound className="size-4" />}
				</span>
				<ChevronDown className="size-3.5" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuLabel className="truncate" title={name}>{name}</DropdownMenuLabel>
				{!isLocalUser(user) && name !== user.email && (
					<p className="truncate px-2 pb-2 text-xs text-muted-foreground" title={user.email}>{user.email}</p>
				)}
				<DropdownMenuSeparator />
				{!local && (
					<>
						<DropdownMenuItem asChild>
							<Link to="/profile">
								<UserRound className="size-4" />Profile
							</Link>
						</DropdownMenuItem>
						{canSwitch && (
							<DropdownMenuSub>
								<DropdownMenuSubTrigger>
									<Building2 className="size-4" />Switch organization
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="w-64">
									<OrganizationMenuItems user={user} showAll={false} />
								</DropdownMenuSubContent>
							</DropdownMenuSub>
						)}
						<DropdownMenuItem asChild>
							<Link to="/">All organizations</Link>
						</DropdownMenuItem>
						{canSeeAdminSection(user) && (
							<DropdownMenuItem asChild>
								<Link to="/admin">
									<Shield className="size-4" />Admin
								</Link>
							</DropdownMenuItem>
						)}
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<Palette className="size-4" />Appearance
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						<DropdownMenuRadioGroup
							value={theme}
							onValueChange={value => {
								if (value === 'light' || value === 'dark' || value === 'system') { setTheme(value); }
							}}
						>
							<DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuSeparator />
				<DropdownMenuItem disabled={signingOut} onSelect={onSignOut}>
					<LogOut className="size-4" />
					{signingOut ? 'Signing out…' : 'Sign Out'}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

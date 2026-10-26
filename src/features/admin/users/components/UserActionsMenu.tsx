import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { AdminUser } from '@/features/admin/users/userAdminApi';
import { SettingsIcon, UserXIcon } from 'lucide-react';

function deactivation(user: AdminUser): { available: boolean; detail: string } {
	// Central manager answers a status change on a deleted account with 404.
	if (user.status === 'DELETED') { return { available: false, detail: 'Deleted accounts cannot be deactivated' }; }
	if (user.status !== 'DEACTIVATED') { return { available: true, detail: 'Ends sessions and blocks sign-in' }; }
	return user.organizations.some((membership) => !membership.lastAdmin)
		? { available: true, detail: 'Already deactivated; leaves the organizations it still can' }
		: { available: false, detail: 'Already deactivated, and in no organization it could leave' };
}

export function UserActionsMenu({ user, onDeactivate }: { user: AdminUser; onDeactivate: () => void }) {
	const { available, detail } = deactivation(user);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="size-9" aria-label="Account settings">
					<SettingsIcon className="size-5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72">
				<DropdownMenuItem variant="destructive" disabled={!available} onSelect={onDeactivate} className="items-start">
					<UserXIcon className="mt-0.5" />
					<span className="flex flex-col gap-0.5">
						<span>Deactivate…</span>
						<span className="text-xs text-muted-foreground">{detail}</span>
					</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

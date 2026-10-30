import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { AdminUser } from '@/features/admin/users/userAdminApi';
import { SettingsIcon, UserCheckIcon, UserXIcon } from 'lucide-react';

// A deactivated account may have kept its memberships on purpose, so removing them is named as its own action
// rather than offered as deactivating again.
function deactivation(user: AdminUser): { label: string; available: boolean; detail: string } {
	// Central manager answers a status change on a deleted account with 404.
	if (user.status === 'DELETED') {
		return { label: 'Deactivate…', available: false, detail: 'Deleted accounts cannot be deactivated' };
	}
	if (user.status !== 'DEACTIVATED') {
		return { label: 'Deactivate…', available: true, detail: 'Ends sessions and blocks sign-in' };
	}
	return user.organizations.some((membership) => !membership.lastAdmin)
		? {
			label: 'Remove from organizations…',
			available: true,
			detail: 'Already deactivated; leaves every organization that keeps another admin',
		}
		: {
			label: 'Remove from organizations…',
			available: false,
			detail: 'Already deactivated, and in no organization it could leave',
		};
}

export function UserActionsMenu({ user, onDeactivate, onReactivate }: {
	user: AdminUser;
	onDeactivate: () => void;
	onReactivate: () => void;
}) {
	const { label, available, detail } = deactivation(user);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="size-9" aria-label="Account settings">
					<SettingsIcon className="size-5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72">
				{user.status === 'DEACTIVATED' && (
					<>
						<DropdownMenuItem onSelect={onReactivate} className="items-start">
							<UserCheckIcon className="mt-0.5" />
							<ItemText label="Reactivate…" detail="Sets the status back to active" />
						</DropdownMenuItem>
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuItem variant="destructive" disabled={!available} onSelect={onDeactivate} className="items-start">
					<UserXIcon className="mt-0.5" />
					<ItemText label={label} detail={detail} />
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ItemText({ label, detail }: { label: string; detail: string }) {
	return (
		<span className="flex flex-col gap-0.5">
			<span>{label}</span>
			<span className="text-xs text-muted-foreground">{detail}</span>
		</span>
	);
}

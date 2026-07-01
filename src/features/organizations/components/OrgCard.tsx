import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { EntityContextMenu, type EntityMenuItem, renderEntityMenuItems } from '@/components/ui/entityMenu';
import { AddCouponModal } from '@/features/organization/modals/AddCouponModal';
import { useAdminMode } from '@/hooks/useAuth';
import { useOrganizationPermissions, useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { Link } from '@tanstack/react-router';
import {
	ArrowRight,
	CreditCardIcon,
	Ellipsis,
	KeyRoundIcon,
	ServerIcon,
	ShieldCheckIcon,
	TicketIcon,
	Trash2Icon,
	UsersIcon,
} from 'lucide-react';
import { useCallback, useState } from 'react';

export function OrgCard({
	organizationRole,
	onDeleteOrgModal,
}: {
	organizationRole: { organizationId: string; organizationName?: string; roleName: string };
	onDeleteOrgModal: (OrganizationRole: { organizationId: string; organizationName?: string }) => void;
}) {
	const { organizationId, organizationName, roleName } = organizationRole;
	const { remove, update: canUpdateOrganization } = useOrganizationPermissions(organizationId);
	const showBilling = canUpdateOrganization;
	const { view: showOrgUsersAndRoles } = useOrganizationRolePermissions(organizationId);
	const isAdminMode = useAdminMode();

	const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);

	const onDeleteClick = useCallback(() => {
		onDeleteOrgModal(organizationRole);
	}, [onDeleteOrgModal, organizationRole]);

	const menuItems: EntityMenuItem[] = [
		{ type: 'label' as const, key: 'label', className: 'text-gray-600 text-xs', label: 'Options' },
		{ type: 'separator' as const, key: 'sep-top' },
		{
			key: 'clusters',
			to: `${organizationId}`,
			icon: <ServerIcon className="size-4 mr-2 text-blue-500" />,
			label: 'Clusters',
		},
		showOrgUsersAndRoles && {
			key: 'roles',
			to: `${organizationId}/roles`,
			icon: <ShieldCheckIcon className="size-4 mr-2 text-purple" />,
			label: 'Roles',
		},
		showOrgUsersAndRoles && {
			key: 'users',
			to: `${organizationId}/users`,
			icon: <UsersIcon className="size-4 mr-2 text-orange-500" />,
			label: 'Users',
		},
		showBilling && {
			key: 'billing',
			to: `${organizationId}/billing`,
			icon: <CreditCardIcon className="size-4 mr-2 text-green-500" />,
			label: 'Billing',
		},
		canUpdateOrganization && {
			key: 'settings',
			to: `${organizationId}/settings`,
			icon: <KeyRoundIcon className="size-4 mr-2 text-yellow-500" />,
			label: 'Settings',
		},
		isAdminMode && {
			key: 'add-coupon',
			onClick: () => setIsCouponModalOpen(true),
			icon: <TicketIcon className="size-4 mr-2 text-pink-500" />,
			label: 'Add Coupon',
		},
		{ type: 'separator' as const, key: 'sep-bottom' },
		{
			key: 'delete',
			onClick: onDeleteClick,
			className: 'focus:bg-red/70 focus:text-white',
			icon: <Trash2Icon className="size-4 mr-2 text-red-500" />,
			label: 'Delete',
		},
	].filter(excludeFalsy);

	return (
		<EntityContextMenu items={remove ? menuItems : []}>
			<Card className="relative h-full justify-between transition-[transform,box-shadow] duration-200 hover:scale-[1.02] hover:shadow-lg hover:ring-2 hover:ring-primary/60 dark:hover:ring-violet-400/70">
				<Link
					to={organizationId}
					aria-label={`View ${organizationName ?? organizationId}`}
					className="absolute inset-0 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-purple-200 focus-visible:outline-none"
				/>
				<CardHeader>
					<CardDescription className="flex items-center justify-between">
						<span className="truncate">{organizationId}</span>
						{remove && (
							<DropdownMenu>
								<DropdownMenuTrigger
									aria-label="Options"
									onClick={(e) => e.stopPropagation()}
									className="relative z-10 -m-2 p-2 rounded-md hover:bg-accent/60 hover:text-foreground"
								>
									<Ellipsis />
								</DropdownMenuTrigger>
								<DropdownMenuContent>
									{renderEntityMenuItems(menuItems, 'dropdown')}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</CardDescription>
					<CardTitle>
						<h2>{organizationName}</h2>
					</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center justify-between gap-2">
					<Badge className="min-w-0 shrink" title={capitalizeWords(roleName)}>
						<span className="truncate">{capitalizeWords(roleName)}</span>
					</Badge>
					{/* The whole card opens the org (stretched link above); this is a visual affordance. */}
					<span className="text-sm shrink-0 py-2 whitespace-nowrap ml-auto">
						View <ArrowRight className="inline-block" />
					</span>
				</CardContent>
				<AddCouponModal
					organizationId={organizationId}
					organizationName={organizationName}
					isOpen={isCouponModalOpen}
					onClose={() => setIsCouponModalOpen(false)}
				/>
			</Card>
		</EntityContextMenu>
	);
}

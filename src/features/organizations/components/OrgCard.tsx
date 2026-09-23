import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { EntityContextMenu, type EntityMenuItem, renderEntityMenuItems } from '@/components/ui/entityMenu';
import { AddCouponModal } from '@/features/organization/modals/AddCouponModal';
import { useStaffPermission } from '@/hooks/useAuth';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useOrganizationPermissions, useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { Link } from '@tanstack/react-router';
import {
	ArrowRight,
	Building2,
	ChevronDown,
	Copy,
	CreditCardIcon,
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
	const name = organizationName || organizationId;
	const [copyId] = useCopyToClipboard(organizationId);
	const { remove, update: canUpdateOrganization } = useOrganizationPermissions(organizationId);
	const showBilling = canUpdateOrganization;
	const { view: showOrgUsersAndRoles } = useOrganizationRolePermissions(organizationId);
	const canAddCoupon = useStaffPermission('billing:write');

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
		canAddCoupon && {
			key: 'add-coupon',
			onClick: () => setIsCouponModalOpen(true),
			icon: <TicketIcon className="size-4 mr-2 text-pink-500" />,
			label: 'Add Coupon',
		},
		remove && { type: 'separator' as const, key: 'sep-bottom' },
		remove && {
			key: 'delete',
			onClick: onDeleteClick,
			className: 'focus:bg-red/70 focus:text-white',
			icon: <Trash2Icon className="size-4 mr-2 text-red-500" />,
			label: 'Delete',
		},
	].filter(excludeFalsy);

	// The menu carries the destructive/staff actions; without either grant the card
	// stays a plain link (org members navigate via the org page's own sub-nav).
	const showMenu = remove || canAddCoupon;

	return (
		<EntityContextMenu items={showMenu ? menuItems : []}>
			<Card className="group relative gap-0 py-0 h-full cursor-pointer justify-between overflow-hidden border border-primary/15 transition-[border-color,box-shadow] duration-200 hover:border-primary/60 hover:shadow-lg hover:ring-2 hover:ring-primary/40 dark:hover:ring-violet-400/60">
				<Link
					to={organizationId}
					aria-label={`Open ${name}`}
					className="absolute inset-0 z-10 cursor-pointer rounded-[inherit] focus-visible:ring-2 focus-visible:ring-purple-200 focus-visible:outline-none"
				/>
				<CardHeader className="gap-4 py-5 border-b border-primary/10 bg-linear-to-br from-primary/5 to-primary/20 dark:from-primary/20 dark:to-primary/5">
					<CardDescription className="flex min-w-0 items-center justify-between gap-3">
						<span className="rounded-lg border border-primary/20 bg-background/50 p-2 text-primary dark:text-violet-300">
							<Building2 className="size-5" aria-hidden="true" />
						</span>
						{showMenu && (
							<DropdownMenu>
								<DropdownMenuTrigger
									aria-label="Options"
									onClick={(e) => e.stopPropagation()}
									className="relative z-20 inline-flex cursor-pointer shrink-0 items-center gap-1.5 rounded-md border border-primary/25 bg-background/60 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-primary/60 hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-ring"
								>
									Options <ChevronDown className="size-3.5" aria-hidden="true" />
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									{renderEntityMenuItems(menuItems, 'dropdown')}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</CardDescription>
					<CardTitle>
						<h2 className="truncate text-xl" title={name}>{name}</h2>
					</CardTitle>
					<div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
						{organizationId !== name && <span className="truncate" title={organizationId}>{organizationId}</span>}
						<button
							type="button"
							onClick={copyId}
							aria-label={`Copy ID for ${name}`}
							className="relative z-20 shrink-0 cursor-pointer rounded p-1 hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-ring"
						>
							<Copy className="size-3.5" aria-hidden="true" />
						</button>
					</div>
				</CardHeader>
				<CardContent className="py-4 flex items-center justify-between gap-2">
					<Badge
						variant="outline"
						className="min-w-0 shrink border-primary/25 bg-primary/10 text-foreground"
						title={capitalizeWords(roleName)}
					>
						<span className="truncate">{capitalizeWords(roleName)}</span>
					</Badge>
					<span className="text-sm shrink-0 py-2 whitespace-nowrap ml-auto">
						Open <ArrowRight className="inline-block" />
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

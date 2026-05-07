import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { AddCouponModal } from '@/features/organization/modals/AddCouponModal';
import { useAdminMode } from '@/hooks/useAuth';
import { useOrganizationPermissions, useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { Link } from '@tanstack/react-router';
import {
	ArrowRight,
	CreditCardIcon,
	Ellipsis,
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

	return (
		<Card className="relative h-full justify-between">
			<CardHeader>
				<CardDescription className="flex items-center justify-between">
					<span className="truncate">{organizationId}</span>
					{remove && (
						<DropdownMenu>
							<DropdownMenuTrigger className="p-4 -m-4 -mr-6 hover:text-white">
								<Ellipsis aria-label="Options" />
							</DropdownMenuTrigger>
							<DropdownMenuContent>
								<DropdownMenuLabel className="text-gray-600 text-xs">Options</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<Link to={`${organizationId}`}>
									<DropdownMenuItem>
										<ServerIcon className="size-4 mr-2 text-blue-500" />
										Clusters
									</DropdownMenuItem>
								</Link>
								{showOrgUsersAndRoles && (
									<Link to={`${organizationId}/roles`}>
										<DropdownMenuItem>
											<ShieldCheckIcon className="size-4 mr-2 text-purple" />
											Roles
										</DropdownMenuItem>
									</Link>
								)}
								{showOrgUsersAndRoles && (
									<Link to={`${organizationId}/users`}>
										<DropdownMenuItem>
											<UsersIcon className="size-4 mr-2 text-orange-500" />
											Users
										</DropdownMenuItem>
									</Link>
								)}
								{showBilling && (
									<Link to={`${organizationId}/billing`}>
										<DropdownMenuItem>
											<CreditCardIcon className="size-4 mr-2 text-green-500" />
											Billing
										</DropdownMenuItem>
									</Link>
								)}
								{isAdminMode && (
									<DropdownMenuItem onClick={() => setIsCouponModalOpen(true)}>
										<TicketIcon className="size-4 mr-2 text-pink-500" />
										Add Coupon
									</DropdownMenuItem>
								)}
								<DropdownMenuSeparator />
								{remove && (
									<DropdownMenuItem
										className="focus:bg-red/70 focus:text-white"
										onClick={onDeleteClick}
									>
										<Trash2Icon className="size-4 mr-2 text-red-500" />
										Delete
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</CardDescription>
				<CardTitle>
					<h2>{organizationName}</h2>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex justify-between">
				<Badge>{capitalizeWords(roleName)}</Badge>
				<Link
					to={organizationId}
					className="text-sm"
					aria-label={`View ${organizationName}`}
					title={`View ${organizationName}`}
				>
					<span className="py-2 transition-all duration-100 ease-in-out border-0 hover:border-b-2">
						View <ArrowRight className="inline-block" />
					</span>
				</Link>
			</CardContent>
			<AddCouponModal
				organizationId={organizationId}
				organizationName={organizationName}
				isOpen={isCouponModalOpen}
				onClose={() => setIsCouponModalOpen(false)}
			/>
		</Card>
	);
}

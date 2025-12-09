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
import { useOrganizationPermissions, useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Ellipsis } from 'lucide-react';
import { useCallback } from 'react';

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
									<DropdownMenuItem>Clusters</DropdownMenuItem>
								</Link>
								{showOrgUsersAndRoles && (
									<Link to={`${organizationId}/roles`}>
										<DropdownMenuItem>Roles</DropdownMenuItem>
									</Link>
								)}
								{showOrgUsersAndRoles && (
									<Link to={`${organizationId}/users`}>
										<DropdownMenuItem>Users</DropdownMenuItem>
									</Link>
								)}
								{showBilling && (
									<Link to={`${organizationId}/billing`}>
										<DropdownMenuItem>Billing</DropdownMenuItem>
									</Link>
								)}
								<DropdownMenuSeparator />
								{remove && (
									<DropdownMenuItem
										className="focus:bg-red/70 focus:text-white"
										onClick={onDeleteClick}
									>
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
		</Card>
	);
}

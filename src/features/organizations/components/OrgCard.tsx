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
import { OrganizationRole } from '@/lib/api.patch';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Ellipsis } from 'lucide-react';
import { useCallback } from 'react';

export function OrgCard({
	organizationRole,
	onDeleteOrgModal,
}: {
	organizationRole: OrganizationRole;
	onDeleteOrgModal: (OrganizationRole: OrganizationRole) => void;
}) {
	const { organizationId, organizationName, roleName } = organizationRole;

	const onDeleteClick = useCallback(() => {
		onDeleteOrgModal(organizationRole);
	}, [onDeleteOrgModal, organizationRole]);

	return (
		<Card className="relative">
			<CardHeader>
				<CardDescription className="flex items-center justify-between">
					<span className="truncate">ORG ID: {organizationId}</span>
					<DropdownMenu>
						<DropdownMenuTrigger>
							<Ellipsis aria-label="Options" />
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuLabel className="text-gray-600 text-xs">Options</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{/*<DropdownMenuItem>Edit</DropdownMenuItem>*/}
							<DropdownMenuItem
								className="bg-red focus:bg-red/70 focus:text-white"
								onClick={onDeleteClick}>
								Delete</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</CardDescription>
				<CardTitle>
					<h2>{organizationName}</h2>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex justify-between">
				<Badge>{roleName}</Badge>
				<Link
					to={`${organizationId}/clusters`}
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

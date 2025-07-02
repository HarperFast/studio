import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Ellipsis } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { BadgeStatusVariant, renderBadgeStatusText, renderBadgeStatusVariant } from '@/components/ui/utils/badgeStatus';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';

export function ClusterCard({
	clusterId,
	clusterName,
	status,
	onDeleteClusterModal,
}: {
	clusterId: string;
	clusterName: string;
	status: BadgeStatusVariant;
	onDeleteClusterModal: () => void;
}) {
	return (
		<Card className="relative">
			<CardHeader>
				<CardDescription className="flex items-center justify-between">
					<span>CLUSTER ID: {clusterId.slice(0, 15)}....</span>
					<DropdownMenu>
						<DropdownMenuTrigger>
							<Ellipsis aria-label="Cluster options" />
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuLabel>Cluster options</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem>Edit</DropdownMenuItem>
							<DropdownMenuItem className="bg-red focus:bg-red/70 focus:text-white" onClick={onDeleteClusterModal}>
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</CardDescription>
				<CardTitle>
					<h2>{clusterName}</h2>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex justify-between">
				<Badge variant={renderBadgeStatusVariant(status)}>{renderBadgeStatusText(status)}</Badge>
				{['CLONE_READY', 'RUNNING', 'UPDATED'].includes(status) ? (
					<Link
						to={`${clusterId}`}
						className="text-sm"
						aria-label={`View ${clusterName}`}
						title={`View ${clusterName}`}
					>
						<span className="py-2 hover:border-b-2">
							View <ArrowRight className="inline-block" />
						</span>
					</Link>
				) : null}
			</CardContent>
		</Card>
	);
}

import { Button } from '@/components/ui/button';
import { authStore } from '@/features/auth/store/authStore';
import { Cluster } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ServerOff } from 'lucide-react';
import { useEffect } from 'react';

function describeDeletion(cluster: Cluster) {
	if (clusterIsSelfManaged(cluster)) {
		return {
			title: 'Cluster Removed',
			detail: 'was removed from Harper Fabric, so it can no longer be managed or signed in to from here.',
		};
	}
	if (cluster.status === 'TERMINATING') {
		return { title: 'Cluster Terminating', detail: 'is being terminated, so it can no longer be signed in to.' };
	}
	return { title: 'Cluster Terminated', detail: 'was terminated, so there is nothing left to sign in to.' };
}

export function ClusterTerminated({ cluster }: { cluster: Cluster }) {
	const { title, detail } = describeDeletion(cluster);
	const finished = cluster.status !== 'TERMINATING';
	// A string, so the 10s poll's fresh cluster object doesn't re-run the effect.
	const signInIds = [cluster.id, ...(cluster.instances ?? []).map((instance) => instance.id)].join(' ');
	useEffect(() => {
		if (finished) {
			authStore.signOutEntitiesLocally(signInIds.split(' '));
		}
	}, [finished, signInIds]);

	return (
		<div className="text-center py-12">
			<ServerOff className="size-12 text-muted-foreground mx-auto mb-4" />
			<h1 className="text-xl font-medium mb-2 text-foreground">{title}</h1>
			<p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
				<span className="font-semibold">{cluster.name}</span> {detail}
			</p>
			<Button asChild variant="outline">
				<Link to={`/${cluster.organizationId}`}>
					<ArrowLeft /> Back to clusters
				</Link>
			</Button>
		</div>
	);
}

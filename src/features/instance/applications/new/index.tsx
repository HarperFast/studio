import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, FolderPlus, Import } from 'lucide-react';
import { CreateNewProjectForm } from '@/features/instance/applications/new/CreateNewProjectForm';
import { useState } from 'react';
import { ImportProjectForm } from '@/features/instance/applications/new/ImportProjectForm';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useUpdateRestartInstance } from '@/features/instance/operations/mutations/updateRestartInstance';
import { toast } from 'sonner';

export function NewApplications() {
	const [appType, setAppType] = useState('');

	const { clusterId, instanceId } = useParams({ strict: false });
	const targetId = instanceId ?? clusterId;
	const { mutate: restartInstance, isPending: isRestartInstanceOrClusterPending } = useUpdateRestartInstance();
	const navigate = useNavigate();
	const targetNoun = instanceId ? 'Instance' : 'Cluster';

	const restartingInstanceOrCluster = () => {
		const toastId = toast.loading('Restarting', {
			description: `Restarting ${targetNoun.toLowerCase()}. This may take up to 60 seconds.`,
			duration: 60000, // Keep the toast open until dismissed
			action: {
				label: 'Dismiss',
				onClick: () => toast.dismiss(),
			},
		});
		restartInstance(targetId, {
			onSuccess: () => {
				toast.dismiss(toastId);
				toast.success('Success', {
					description: `${targetNoun} restarted!`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
				void navigate({ to: `../editor` });
			},
			onError: () => {
				toast.error('Error', {
					description: `Failed to restart ${targetNoun.toLowerCase()}.`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			},
		});
	};
	return (
		<div className="flex items-center justify-center gap-4 min-h-[calc(80vh-theme(spacing.20))]">
			<Card className="w-full h-full max-w-xl">
				<CardHeader>
					<Link
						to=".."
						className="text-sm"
						aria-label={`Go back to applications main menu`}
						title={`Go back to applications main menu`}
					>
						<span className="py-2 transition-all duration-100 ease-in-out border-0 hover:border-b-2">
							<ArrowLeft className="inline-block" /> Back
						</span>
					</Link>
					<div className="text-center">
						<CardTitle>Create/Import An Application</CardTitle>
						<CardDescription>Create a new or import an existing application</CardDescription>
					</div>
				</CardHeader>
				<CardContent>
					<div className="flex justify-center mb-4">
						<Button className="py-4" variant="positiveOutline" onClick={() => setAppType('create')}>
							<FolderPlus />
							Create
						</Button>

						<Button className="py-4 ml-4" variant="positiveOutline" onClick={() => setAppType('import')}>
							<Import />
							Import
						</Button>
					</div>
					<div className="mt-6">
						{appType === 'create' ? (
							<CreateNewProjectForm
								restartingInstanceOrCluster={restartingInstanceOrCluster}
								isRestartInstanceOrClusterPending={isRestartInstanceOrClusterPending}
							/>
						) : appType === 'import' ? (
							<ImportProjectForm
								restartingInstanceOrCluster={restartingInstanceOrCluster}
								isRestartInstanceOrClusterPending={isRestartInstanceOrClusterPending}
							/>
						) : (
							<p className="text-center">Please select an option to continue.</p>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

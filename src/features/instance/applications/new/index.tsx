import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientParams } from '@/config/useInstanceClient';
import { CreateNewProjectForm } from '@/features/instance/applications/new/CreateNewProjectForm';
import { ImportProjectForm } from '@/features/instance/applications/new/ImportProjectForm';
import { useRestartClick } from '@/hooks/useRestartClick';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, FolderPlus, Import } from 'lucide-react';
import { useCallback, useState } from 'react';

export function NewApplications() {
	const [appType, setAppType] = useState('');

	const { instanceId }: { instanceId?: string; } = useParams({ strict: false });
	const { instanceClient } = useInstanceClientParams();
	const navigate = useNavigate();
	const targetNoun = (instanceId || isLocalStudio) ? 'Instance' : 'Cluster';

	const onRestartedSuccessfully = useCallback(() => {
		void navigate({ to: `../editor` });
	}, [navigate]);
	const { onRestartClick, isRestartPending } = useRestartClick({ targetNoun, instanceClient, onRestartedSuccessfully });

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
								triggerRestart={onRestartClick}
								isRestartPending={isRestartPending}
							/>
						) : appType === 'import' ? (
							<ImportProjectForm
								triggerRestart={onRestartClick}
								isRestartPending={isRestartPending}
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

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, FolderPlus, Import } from 'lucide-react';
import CreateNewProjectFrom from './CreateNewProjectFrom';
import { useState } from 'react';
import ImportProjectForm from './ImportProjectForm';
import { getRouteApi, Link } from '@tanstack/react-router';

const route = getRouteApi('');

function NewApplications() {
	const [appType, setAppType] = useState('');
	const { organizationId, clusterId, instanceId } = route.useParams();
	return (
		<div className="flex items-center justify-center gap-4 min-h-[calc(80vh-theme(spacing.20))]">
			<Card className="w-full h-full max-w-xl">
				<CardHeader>
					<Link
						to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/applications`}
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
							<CreateNewProjectFrom />
						) : appType === 'import' ? (
							<ImportProjectForm />
						) : (
							<p className="text-center">Please select an option to continue.</p>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

export default NewApplications;

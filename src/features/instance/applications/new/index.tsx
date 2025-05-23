import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderPlus, Import } from 'lucide-react';
import CreateNewProjectFrom from './CreateNewProjectFrom';
import { useState } from 'react';
import ImportProjectForm from './ImportProjectForm';

function NewApplications() {
	const [appType, setAppType] = useState('');
	return (
		<div className="flex items-center justify-center gap-4 min-h-[calc(80vh-theme(spacing.20))]">
			<Card className="w-full h-full max-w-xl">
				<CardHeader className="text-center">
					<CardTitle>Create/Import An Application</CardTitle>
					<CardDescription>Create a new or import an existing application</CardDescription>
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

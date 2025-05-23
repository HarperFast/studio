import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { Edit, FolderPlus } from 'lucide-react';

function ApplicationsIndex() {
	return (
		<div className="flex flex-col items-center justify-center gap-4 min-h-[calc(80vh-theme(spacing.20))]">
			<h1 className="text-2xl font-bold text-center text-white">Applications</h1>
			<Link to="/applications/create" className="w-full max-w-80">
				<Button className="w-full py-10 text-lg" variant="positiveOutline">
					<Edit />
					Edit Applications
				</Button>
			</Link>
			<Link to="/applications/create" className="w-full max-w-80">
				<Button className="w-full py-10 text-lg" variant="positiveOutline">
					<FolderPlus />
					Add A New Application
				</Button>
			</Link>
		</div>
	);
}

export default ApplicationsIndex;

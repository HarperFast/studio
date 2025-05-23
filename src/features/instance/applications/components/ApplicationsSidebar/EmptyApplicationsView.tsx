import { Button } from '@/components/ui/button';
import { FolderOpen, Plus } from 'lucide-react';

function EmptyApplicationsView() {
	return (
		<div className="flex flex-col items-center justify-center h-full px-4 text-center">
			<FolderOpen className="w-10 h-10 mt-16 mb-4 text-gray-400" />
			<h2 className="text-xl font-semibold">No Applications Found</h2>
			<p>See the documentation for more info on Harper Applications.</p>
			<Button className="mt-4 rounded-full" variant="positiveOutline">
				<Plus /> Create A New Application
			</Button>
		</div>
	);
}
export default EmptyApplicationsView;

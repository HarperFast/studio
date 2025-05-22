import { Button } from '@/components/ui/button';
import { Import, Plus } from 'lucide-react';
import ApplicationsSidebar from '@/features/instance/applications/components/ApplicationsSidebar';

function Applications() {
	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-12">
			<section className='className="col-span-1 text-white md:col-span-4 lg:col-span-3'>
				<ApplicationsSidebar />
			</section>
			<section className="col-span-1 text-white md:col-span-8 lg:col-span-9">
				<div className="flex flex-col items-center justify-center h-full mt-10 text-center">
					<h1 className="text-2xl font-bold">Applications</h1>
					<p className="mt-2 text-gray-500">No Applications Found.</p>
					<div>
						<Button className="mt-4 rounded-full" variant="positiveOutline">
							<Plus /> Create A New Application
						</Button>
					</div>
					<div>
						<Button className="mt-4 rounded-full" variant="positiveOutline">
							<Import /> Import A Remote Application Package
						</Button>
					</div>
				</div>
			</section>
		</div>
	);
}

export default Applications;

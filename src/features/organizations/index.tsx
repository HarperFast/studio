import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OrgCard } from '@/features/organizations/components/OrgCard';
import { useGetCurrentUser } from '@/hooks/useGetCurrentUser';
import { NewOrganizationModal } from '@/features/organizations/modals/NewOrganizationModal';
export function OrganizationsIndex() {
	const { data: user } = useGetCurrentUser();
	return (
		<div>
			<section className="py-5 bg-muted-foreground/20">
				<div className="flex flex-col-reverse justify-between items-center gap-4 md:gap-0 md:flex-row px-4 md:px-12">
					<div className="w-full">
						<Input placeholder="Filter organizations by name" className="inline-block w-3/5 md:w-64" />
						<Button className="inline-block w-2/5 md:w-auto md:ml-4">
							Sort by A-Z
							<span>
								<ChevronDown className="inline-block" />
							</span>
						</Button>
					</div>
					<NewOrganizationModal />
				</div>
			</section>
			<section className="px-4 md:px-12 pt-4">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-12">
					{user?.roles.map(({ organizationId, organizationName, roleName }) => (
						<div key={organizationId} className="cols-span-1 md:col-span-4 lg:col-span-3 2xl:col-span-2">
							<OrgCard organizationId={organizationId} organizationName={organizationName} roleName={roleName} />
						</div>
					))}
				</div>
			</section>
		</div>
	);
}



import { NestedContentWithSubNavMenu } from '@/components/NestedContentWithSubNavMenu';
import { DomainsManagement } from './Management';

export function DomainsPage() {
	return (
		<NestedContentWithSubNavMenu className="flex flex-col justify-start max-w-4xl">
			<DomainsManagement />
		</NestedContentWithSubNavMenu>
	);
}

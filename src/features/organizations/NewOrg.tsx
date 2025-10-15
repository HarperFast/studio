import { SubNavMenu } from '@/components/SubNavMenu';
import { NewOrgForm } from '@/features/organizations/components/NewOrgForm';

export function NewOrg() {
	return (
		<>
			<SubNavMenu />
			<section className="mt-40 md:mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<NewOrgForm />
			</section>
		</>
	);
}

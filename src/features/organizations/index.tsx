import { OrgCard } from '@/features/organizations/components/OrgCard';
import { useAuthenticationContext } from '@/hooks/useAuthenticationContext';
import { NewOrganizationModal } from '@/features/organizations/modals/NewOrganizationModal';
import { isLocalUser } from '@/contexts/authenticationContext';
import { useMemo } from 'react';

export function OrganizationsIndex() {
	const { user } = useAuthenticationContext();
	if (isLocalUser(user)) {
		throw new Error('Local users cannot access organizations.');
	}
	const sortedRoles = useMemo(() => user?.roles.slice().sort((a, b) => a.organizationName > b.organizationName ? 1 : -1) || [], [user]);
	return (
		<>
			<nav className="fixed top-20 w-full h-12 z-39 px-4 md:px-12 bg-grey-700">
				<div className="flex items-center justify-between h-full text-sm text-white">
					<div className="w-full">
						{/*<Input*/}
						{/*	placeholder="Filter organizations by name"*/}
						{/*	className="inline-block w-3/5 md:w-64"*/}
						{/*	onChange={notYetImplemented}*/}
						{/*/>*/}
						{/*<Button className="inline-block w-2/5 md:w-auto md:ml-4" onClick={notYetImplemented}>*/}
						{/*	Sort by A-Z*/}
						{/*	<span>*/}
						{/*		<ChevronDown className="inline-block" />*/}
						{/*	</span>*/}
						{/*</Button>*/}
					</div>
					<NewOrganizationModal />
				</div>
			</nav>
			<section className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-12">
					{sortedRoles.map(({ organizationId, organizationName, roleName }) => (
						<div key={organizationId} className="cols-span-1 md:col-span-4 lg:col-span-3 2xl:col-span-2">
							<OrgCard organizationId={organizationId} organizationName={organizationName}
									 roleName={roleName} />
						</div>
					))}
				</div>
			</section>
		</>
	);
}

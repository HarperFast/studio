import { Loading } from '@/components/Loading';
import { Suspense, useState } from 'react';
import { getListRolesQueryOptions } from '@/features/instance/operations/queries/getListRoles';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { BrowseDataTable } from '@/features/instance/config/roles/components/BrowseDataTable';
import { dataTableColumns } from '@/features/instance/config/roles/constants/tableDefinition';
import { EditRoleModal } from './modals/EditRoleModal';

const route = getRouteApi('');

export function ConfigRolesIndex() {
	const { instanceId } = route.useParams();
	const {
		data: localRoles,
		// refetch,
		isFetching,
		// isRefetching,
	} = useSuspenseQuery(getListRolesQueryOptions(instanceId));

	const [isEditModalOpen, setIsEditModalOpen] = useState(false);

	const handleRoleDeleted = () => {
		console.log('Role deleted');
	};
	const handleRoleUpdated = () => {
		console.log('Role updated');
	};

	return (
		<Suspense fallback={<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />}>
			<BrowseDataTable
				columns={dataTableColumns}
				data={localRoles}
				isFetching={isFetching}
				onRowClick={() => setIsEditModalOpen(true)}
			/>
			<EditRoleModal
				instanceId={instanceId}
				isModalOpen={isEditModalOpen}
				closeModal={() => setIsEditModalOpen(false)}
				data={localRoles[0]}
				onRoleDeleted={handleRoleDeleted}
				onRoleUpdated={handleRoleUpdated}
			/>
		</Suspense>
	);
}

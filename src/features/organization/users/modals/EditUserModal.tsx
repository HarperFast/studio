import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getOrganizationRolesQueryOptions } from '@/features/organization/queries/getOrganizationRoles';
import { OrgUserRoleCheckbox } from '@/features/organization/users/components/OrgUserRoleCheckbox';
import { useCloudAuth } from '@/hooks/useAuth';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { SchemaUser } from '@/integrations/api/api.gen';
import { keyBy } from '@/lib/keyBy';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

export function EditUserModal({
	closeModal,
	data,
	isModalOpen,
	onUserUpdated,
}: {
	closeModal: () => void;
	data: SchemaUser;
	isModalOpen: boolean;
	onUserUpdated: () => void;
}) {
	const { organizationId }: { organizationId: string } = useParams({ strict: false });
	const auth = useCloudAuth();
	const { update, remove } = useOrganizationRolePermissions(organizationId);
	const isSelf = auth.user?.email === data.email;
	const { data: orgRoles } = useSuspenseQuery(getOrganizationRolesQueryOptions(organizationId));
	const selectedRoles = useMemo(() => data.roles ? keyBy(data.roles, 'roleName') : {}, [data]);
	const [changesMade, setChangesMade] = useState<boolean>(false);

	// TODO: Cancel invite
	return (
		<Dialog onOpenChange={changesMade ? onUserUpdated : closeModal} open={isModalOpen}>
			<DialogContent className="sm:max-w-[750px]">
				<DialogHeader>
					<DialogTitle>{update ? 'Edit ' : 'View '} {data.email} {isSelf ? '(yourself)' : ''}</DialogTitle>
				</DialogHeader>

				{update && (
					<DialogDescription>
						To remove {isSelf ? 'your self' : 'this user'} from the organization, uncheck all of the boxes below.
					</DialogDescription>
				)}

				{orgRoles.map((orgRole) => (
					<OrgUserRoleCheckbox
						key={orgRole.id}
						readOnly={!update}
						canRemove={remove}
						data={data}
						orgRole={orgRole}
						selectedRoles={selectedRoles}
						setChangesMade={setChangesMade}
					/>
				))}
			</DialogContent>
		</Dialog>
	);
}

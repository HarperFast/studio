import { Loading } from '@/components/Loading';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getOrganizationRolesQueryOptions } from '@/features/organization/queries/getOrganizationRoles';
import { OrgUserRoleCheckbox } from '@/features/organization/users/components/OrgUserRoleCheckbox';
import { useCloudAuth } from '@/hooks/useAuth';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { SchemaUser } from '@/integrations/api/api.gen';
import { keyBy } from '@/lib/keyBy';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Suspense, useMemo, useState } from 'react';

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
	const [changesMade, setChangesMade] = useState<boolean>(false);

	// TODO: Cancel invite
	return (
		<Dialog onOpenChange={changesMade ? onUserUpdated : closeModal} open={isModalOpen}>
			<DialogContent resizable>
				<DialogHeader>
					<DialogTitle>{update ? 'Edit ' : 'View '} {data.email} {isSelf ? '(yourself)' : ''}</DialogTitle>
				</DialogHeader>

				{update && (
					<DialogDescription>
						To remove {isSelf ? 'your self' : 'this user'} from the organization, uncheck all of the boxes below.
					</DialogDescription>
				)}

				{/* The role list loads behind its own boundary so the dialog opens (and stays closeable) immediately. */}
				<Suspense fallback={<Loading centered text="Loading roles…" className="flex-1 min-h-0" />}>
					<EditUserRolesList
						data={data}
						organizationId={organizationId}
						update={update}
						remove={remove}
						setChangesMade={setChangesMade}
					/>
				</Suspense>
			</DialogContent>
		</Dialog>
	);
}

function EditUserRolesList({
	data,
	organizationId,
	update,
	remove,
	setChangesMade,
}: {
	data: SchemaUser;
	organizationId: string;
	update: boolean;
	remove: boolean;
	setChangesMade: (value: boolean) => void;
}) {
	const { data: orgRoles } = useSuspenseQuery(getOrganizationRolesQueryOptions(organizationId));
	const selectedRoles = useMemo(() => data.roles ? keyBy(data.roles, 'id') : {}, [data]);

	return (
		<div className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto">
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
		</div>
	);
}

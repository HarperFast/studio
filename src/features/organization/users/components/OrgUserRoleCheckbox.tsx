import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAddUserToOrganizationRole } from '@/features/organization/mutations/addUserToOrganizationRole';
import { useRemoveUserFromOrganizationRole } from '@/features/organization/mutations/removeUserFromOrganizationRole';
import { useCheckboxCallback } from '@/hooks/useCheckboxCallback';
import { SchemaOrganizationRole, SchemaUser } from '@/integrations/api/api.gen';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function OrgUserRoleCheckbox({
	data,
	readOnly,
	canRemove,
	orgRole,
	selectedRoles,
	setChangesMade,
}: {
	data: SchemaUser;
	readOnly: boolean;
	canRemove: boolean;
	orgRole: SchemaOrganizationRole,
	selectedRoles: Record<string, SchemaOrganizationRole>,
	setChangesMade: (value: boolean) => void,
}) {
	const { mutate: addUser, isPending: isAddPending } = useAddUserToOrganizationRole();
	const { mutate: removeUser, isPending: isRemovePending } = useRemoveUserFromOrganizationRole();
	const userIsInRole = !!selectedRoles[orgRole.roleName];
	const [wasChecked, setWasChecked] = useState(userIsInRole);
	const [isChecked, onCheckedChanged] = useCheckboxCallback(userIsInRole);
	useEffect(() => {
		if (isChecked !== wasChecked) {
			if (isChecked) {
				addUser(
					{ email: data.email, roleId: orgRole.id },
					{
						onSuccess: () => {
							setWasChecked(isChecked);
							setChangesMade(true);
							toast.success(`Role added successfully`);
						},
					},
				);
			} else {
				removeUser(
					{ userId: data.id, roleId: orgRole.id },
					{
						onSuccess: () => {
							setWasChecked(isChecked);
							setChangesMade(true);
							toast.success(`Role removed successfully`);
						},
					},
				);
			}
		}
	}, [addUser, data.email, data.id, isChecked, orgRole.id, removeUser, setChangesMade, wasChecked]);

	return <Label key={orgRole.id} className="flex">
		<Input
			type="checkbox"
			className="w-6"
			disabled={readOnly || isAddPending || isRemovePending || (!canRemove && isChecked)}
			checked={isChecked}
			onChange={onCheckedChanged}
		/>
		<span className="pl-4 pr-8 flex-1 py-2.5">{orgRole.roleName}</span>
	</Label>;
}

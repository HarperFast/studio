import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { calculateDefaultPermissions } from '@/features/instance/config/roles/defaultCalculator';
import { useAlterRole } from '@/features/instance/operations/mutations/alterRole';
import { useDeleteRoleMutation } from '@/features/instance/operations/mutations/deleteRole';
import { getDescribeAllQueryOptions } from '@/features/instance/operations/queries/getDescribeAll';
import { getRegistrationInfoQueryOptions } from '@/features/instance/operations/queries/getRegistrationInfo';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useCheckboxCallback } from '@/hooks/useCheckboxCallback';
import { LocalRole, LocalRolePermission } from '@/lib/api.patch';
import { safeParse } from '@/lib/string/safeParse';
import { Editor } from '@monaco-editor/react';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

export function EditRoleModal({
	data,
	instanceId,
	clusterId,
	isModalOpen,
	closeModal,
	onSelectRole,
	onChangesSaved,
}: {
	data: LocalRole;
	instanceId?: string;
	clusterId?: string;
	isModalOpen: boolean;
	closeModal: () => void;
	onSelectRole: (role?: string) => void;
	onChangesSaved: () => void;
}) {
	const { role, permission: initialPermissions } = data;
	const [updatedPermissions, setUpdatedPermissions] = useState<string | undefined>(JSON.stringify(initialPermissions, null, 2));

	const instanceParams = useInstanceClientIdParams();
	const [isValidJSON, setIsValidJSON] = useState(true);
	const { data: instanceDatabaseMap } = useQuery(getDescribeAllQueryOptions(instanceParams));
	const { data: registrationInfo } = useQuery(
		getRegistrationInfoQueryOptions(instanceParams),
	);
	const auth = useInstanceAuth(instanceId ?? clusterId);
	const isSelf = auth.user?.role?.role === data.role;

	const [showAttributes, onShowAttributesChanged] = useCheckboxCallback(updatedPermissions?.includes('attribute_name'));

	const { mutate: alterRole, isPending } = useAlterRole();
	const { mutate: dropRole } = useDeleteRoleMutation();

	const onValidate = useCallback(
		(markers: unknown[]) => {
			setIsValidJSON(markers.length === 0);
		},
		[setIsValidJSON],
	);

	const defaultValue = useMemo(() => {
		return JSON.stringify(instanceDatabaseMap && registrationInfo && calculateDefaultPermissions({
			instanceDatabaseMap,
			currentRolePermissions: updatedPermissions && safeParse(updatedPermissions) || initialPermissions,
			version: registrationInfo.version,
			showAttributes: showAttributes,
		}), null, 2);
		// We exclude updatedPermissions on purpose from the deps.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initialPermissions, instanceDatabaseMap, registrationInfo, showAttributes]);

	useEffect(() => {
		setUpdatedPermissions(defaultValue);
	}, [defaultValue]);

	const onRoleUpdated = useCallback(
		(updatedPermissions: string) => {
			if (updatedPermissions) {
				const parsedPermissions = JSON.parse(updatedPermissions) as LocalRolePermission;
				if (parsedPermissions.super_user || parsedPermissions.structure_user || parsedPermissions.cluster_user) {
					for (const parsedPermissionsKey in parsedPermissions) {
						if (parsedPermissionsKey !== 'super_user' && parsedPermissionsKey !== 'structure_user' && parsedPermissionsKey !== 'cluster_user') {
							// If you're a super, structure or cluster user, you don't need more specific permissions.
							delete parsedPermissions[parsedPermissionsKey];
						} else if (parsedPermissions[parsedPermissionsKey] === false) {
							// If you've set one of the top-level properties, clear out any others set to false.
							delete parsedPermissions[parsedPermissionsKey];
						}
					}
				}
				alterRole(
					{
						id: data.id,
						permission: parsedPermissions,
						...instanceParams,
					},
					{
						onSuccess: () => {
							toast.success('Role updated successfully!');
							onSelectRole(undefined);
							onChangesSaved();
						},
					},
				);
			}
		},
		[alterRole, data.id, instanceParams, onChangesSaved, onSelectRole],
	);

	const onRoleDeleted = useCallback(() => {
		dropRole(
			{
				id: data.id,
				...instanceParams,
			},
			{
				onSuccess: () => {
					toast.success('Role deleted successfully!');
					onSelectRole(undefined);
					onChangesSaved();
				},
			},
		);
	}, [data.id, dropRole, instanceParams, onChangesSaved, onSelectRole]);

	const onSubmitClick = useCallback(() => {
		if (updatedPermissions && isValidJSON) {
			onRoleUpdated(updatedPermissions);
		}
	}, [updatedPermissions, onRoleUpdated, isValidJSON]);

	const onRoleDeleteClick = useCallback(() => {
		onRoleDeleted();
	}, [onRoleDeleted]);

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent className="sm:max-w-[750px]">
				<DialogTitle>{isSelf ? 'View' : 'Edit'} Role "{role}"</DialogTitle>
				<DialogDescription>
					{isSelf
						? 'You can view your own role, but you cannot edit it. Please assign yourself a different' +
						' role to edit this role.'
						: 'Edit the role\'s permissions in JSON format or remove the role entirely.'}
				</DialogDescription>
				{defaultValue ? <Editor
					theme="vs-dark"
					height="400px"
					defaultLanguage="json"
					value={updatedPermissions}
					options={isSelf ? { readOnly: true } : undefined}
					onValidate={onValidate}
					onChange={setUpdatedPermissions}
					defaultValue={defaultValue}
				/> : <TextLoadingSkeleton />}
				<DialogFooter>
					{!isSelf && (<div className="flex justify-between w-full">
						<Button
							type="button"
							variant="destructiveOutline"
							className="rounded-full"
							onClick={onRoleDeleteClick}
							disabled={isPending}
						>
							Delete Role
						</Button>

						<div className="grow" />

						<Label className="flex">
							<Input
								type="checkbox"
								className="w-6"
								checked={showAttributes}
								onChange={onShowAttributesChanged}
							/>
							<span className="pl-4 pr-8 flex-1 py-2.5">Pick Attributes</span>
						</Label>

						<Button
							variant="submit"
							className="rounded-full"
							onClick={onSubmitClick}
							disabled={isPending || !isValidJSON}
						>
							Save Changes
						</Button>
					</div>)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

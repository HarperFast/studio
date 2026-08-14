import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { calculateDefaultPermissions } from '@/features/instance/config/roles/defaultCalculator';
import { OperationsAllowlistEditor } from '@/features/instance/config/roles/operations/OperationsAllowlistEditor';
import { supportsOperationsAllowlist } from '@/features/instance/config/roles/operations/operationsCatalog';
import { preparePermissionForSave } from '@/features/instance/config/roles/preparePermissionForSave';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useCheckboxCallback } from '@/hooks/useCheckboxCallback';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { LocalRole, LocalRolePermission } from '@/integrations/api/api.patch';
import { useAlterRole } from '@/integrations/api/instance/auth/alterRole';
import { useDeleteRoleMutation } from '@/integrations/api/instance/auth/deleteRole';
import { getDescribeAllQueryOptions } from '@/integrations/api/instance/database/getDescribeAll';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import {
	getOperationsAllowlist,
	hasMalformedOperations,
	orderPermissionKeys,
	withOperations,
} from '@/integrations/api/localRolePermission';
import { Editor } from '@/lib/monaco/MonacoEditor';
import { safeParse } from '@/lib/string/safeParse';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
	const monacoTheme = useMonacoTheme();
	const { role, permission: initialPermissions } = data;
	const [updatedPermissions, setUpdatedPermissions] = useState<string | undefined>(
		JSON.stringify(initialPermissions, null, 2),
	);

	const instanceParams = useInstanceClientIdParams();
	const [isValidJSON, setIsValidJSON] = useState(true);
	// Permission editing only needs the schema tree (attributes), never record counts, so skip the count
	// scan -- and share the same count-free describe_all cache entry the Databases tab populates.
	const { data: instanceDatabaseMap } = useQuery(
		getDescribeAllQueryOptions({ ...instanceParams, skipRecordCount: true }),
	);
	const { data: registrationInfo } = useQuery(
		getRegistrationInfoQueryOptions(instanceParams),
	);
	const auth = useInstanceAuth(instanceId ?? clusterId);
	const isSelf = auth.user?.role?.id === data.id;

	const [showAttributes, onShowAttributesChanged] = useCheckboxCallback(updatedPermissions?.includes('attribute_name'));

	const { mutate: alterRole, isPending } = useAlterRole();
	const { mutate: dropRole, isPending: isDeletePending } = useDeleteRoleMutation();
	const [isConfirmDeleteModalOpen, setIsConfirmDeleteModalOpen] = useState(false);

	const onValidate = useCallback(
		(markers: unknown[]) => {
			setIsValidJSON(markers.length === 0);
		},
		[setIsValidJSON],
	);

	const defaultValue = useMemo(() => {
		return JSON.stringify(
			instanceDatabaseMap && registrationInfo && orderPermissionKeys(calculateDefaultPermissions({
				instanceDatabaseMap,
				currentRolePermissions: updatedPermissions && safeParse(updatedPermissions) || initialPermissions,
				version: registrationInfo.version,
				showAttributes: showAttributes,
			})),
			null,
			2,
		);
		// We exclude updatedPermissions on purpose from the deps: defaultValue must only recompute on
		// load and when showAttributes toggles, otherwise the useEffect below overwrites the editor's
		// value on every keystroke and Monaco jumps the cursor to the end of the input.
		// eslint-disable-next-line react/exhaustive-deps
	}, [initialPermissions, instanceDatabaseMap, registrationInfo, showAttributes]);

	useEffect(() => {
		setUpdatedPermissions(defaultValue);
	}, [defaultValue]);

	// The structured operations editor is a lens over the JSON text: it reads the parsed
	// `operations` array and writes changes back into the text, which stays the single source of
	// truth. Monaco applies programmatic value updates without firing onChange, so this can't loop.
	const operationsSupported = supportsOperationsAllowlist(registrationInfo?.version);
	const previousOperationsRef = useRef<string[] | undefined>(undefined);
	const { operationsValue, malformedOperations } = useMemo(() => {
		const parsed = isValidJSON && updatedPermissions
			? safeParse<LocalRolePermission>(updatedPermissions)
			: null;
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return { operationsValue: undefined, malformedOperations: false };
		}
		// Reuse the previous array identity when the content hasn't changed, so unrelated typing in
		// the JSON editor doesn't re-render the whole picker subtree.
		const next = getOperationsAllowlist(parsed);
		const previous = previousOperationsRef.current;
		const stable = next && previous && next.length === previous.length
				&& next.every((entry, index) => entry === previous[index])
			? previous
			: next;
		previousOperationsRef.current = stable;
		// A present-but-not-string-array `operations` (e.g. `true`) is left to the JSON editor
		// rather than clobbered from the structured one.
		return { operationsValue: stable, malformedOperations: hasMalformedOperations(parsed) };
	}, [isValidJSON, updatedPermissions]);

	const onOperationsChanged = useCallback(
		(next: string[] | undefined) => {
			setUpdatedPermissions((current) => {
				const parsed = current ? safeParse<LocalRolePermission>(current) : null;
				if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
					return current;
				}
				// withOperations also floats the reserved keys (operations included) to the top of the
				// document, where the allowlist is visible without scrolling past table permissions.
				return JSON.stringify(withOperations(parsed, next), null, 2);
			});
		},
		[],
	);

	const onRoleUpdated = useCallback(
		(updatedPermissions: string) => {
			if (updatedPermissions) {
				const parsedPermissions = preparePermissionForSave(JSON.parse(updatedPermissions) as LocalRolePermission);
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
		setIsConfirmDeleteModalOpen(true);
	}, []);

	return (
		<>
			<Dialog onOpenChange={closeModal} open={isModalOpen}>
				<DialogContent resizable>
					<DialogTitle>{isSelf ? 'View' : 'Edit'} Role "{role}"</DialogTitle>
					<DialogDescription>
						{isSelf
							? 'You can view your own role, but you cannot edit it. Please assign yourself a different'
								+ ' role to edit this role.'
							: "Edit the role's permissions in JSON format or remove the role entirely."}
					</DialogDescription>
					{operationsSupported && registrationInfo && (
						malformedOperations
							? (
								<p className="text-xs text-muted-foreground">
									This role's <span className="font-mono">operations</span>{' '}
									value is not an array of operation names; edit it in the JSON below.
								</p>
							)
							: (
								<OperationsAllowlistEditor
									value={operationsValue}
									onChange={onOperationsChanged}
									version={registrationInfo.version}
									disabled={isSelf || !isValidJSON}
								/>
							)
					)}
					<div className="flex-1 min-h-0">
						{defaultValue
							? (
								<Editor
									className="w-full h-full"
									theme={monacoTheme}
									defaultLanguage="json"
									value={updatedPermissions}
									options={{ readOnly: isSelf, automaticLayout: true }}
									onValidate={onValidate}
									onChange={setUpdatedPermissions}
									defaultValue={defaultValue}
								/>
							)
							: <TextLoadingSkeleton />}
					</div>
					<DialogFooter>
						{!isSelf && (
							<div className="flex justify-between w-full">
								<Button
									type="button"
									variant="destructiveOutline"
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
									onClick={onSubmitClick}
									disabled={isPending || !isValidJSON}
								>
									Save Changes
								</Button>
							</div>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<ConfirmDeletionModal
				isModalOpen={isConfirmDeleteModalOpen}
				setIsModalOpen={setIsConfirmDeleteModalOpen}
				deletionConfirmed={onRoleDeleted}
				deletionPending={isDeletePending}
				typeOfThingBeingDeleted="role"
				nameOfThingBeingDeleted={role}
				hideDataLossWarning={true}
			/>
		</>
	);
}

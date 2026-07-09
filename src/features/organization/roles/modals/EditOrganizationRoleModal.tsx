import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useDeleteOrganizationRole } from '@/features/organization/mutations/deleteOrganizationRole';
import {
	OrganizationRoleOverviewSchema,
	OrganizationRoleOverviewType,
	OrganizationRoleSpecificPermissionsType,
	OrganizationRoleUpdatePayloadType,
} from '@/features/organization/mutations/OrganizationRoleFormSchema';
import { useUpdateOrganizationRole } from '@/features/organization/mutations/updateOrganizationRole';
import { getOrganizationRoleInfoQueryOptions } from '@/features/organization/queries/getOrganizationRoleInfo';
import { useCloudAuth } from '@/hooks/useAuth';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { SchemaOrganizationRole } from '@/integrations/api/api.gen';
import { Editor } from '@/lib/monaco/MonacoEditor';
import { safeParse } from '@/lib/string/safeParse';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDeletionContent } from './ConfirmDeletionContent';

export function EditOrganizationRoleModal({
	data,
	isModalOpen,
	closeModal,
}: {
	data: SchemaOrganizationRole;
	isModalOpen: boolean;
	closeModal: (madeChanges: boolean) => void;
}) {
	const onOpenChanges = useCallback(() => closeModal(false), [closeModal]);
	return (
		<Dialog onOpenChange={onOpenChanges} open={isModalOpen}>
			<DialogContent resizable>
				{
					/*
					Render the dialog shell (overlay + close button) immediately and load the role's
					details behind an inner Suspense boundary. Opening a role now shows a loading state
					inside the modal — and stays closeable — instead of bubbling up and blanking the list.
				*/
				}
				<Suspense fallback={<EditOrganizationRoleModalLoading roleName={data.roleName} />}>
					<EditOrganizationRoleModalContent data={data} closeModal={closeModal} />
				</Suspense>
			</DialogContent>
		</Dialog>
	);
}

function EditOrganizationRoleModalLoading({ roleName }: { roleName: string }) {
	return (
		<>
			<DialogTitle>Organization Role "{roleName}"</DialogTitle>
			<Loading centered text="Loading role…" className="flex-1 min-h-0" />
		</>
	);
}

function EditOrganizationRoleModalContent({
	data,
	closeModal,
}: {
	data: SchemaOrganizationRole;
	closeModal: (madeChanges: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const { data: roleInfo } = useSuspenseQuery(
		getOrganizationRoleInfoQueryOptions({ roleId: data.id, organizationId: data.organizationId }),
	);
	const auth = useCloudAuth();
	const isSelf = auth.user?.roles?.[data.organizationId]?.id === data.id;
	const { update, remove } = useOrganizationRolePermissions(data.organizationId);
	const { mutate: updateOrganizationRole, isPending: isRoleUpdatePending } = useUpdateOrganizationRole();
	const { mutate: deleteOrganizationRole, isPending: isRoleDeletionPending } = useDeleteOrganizationRole();

	const monacoTheme = useMonacoTheme();
	const [isConfirmingRoleDeletion, setIsConfirmingRoleDeletion] = useState(false);

	const form = useForm({
		resolver: zodResolver(OrganizationRoleOverviewSchema),
		defaultValues: {
			name: data.roleName,
			update: roleInfo.organization.update || false,
			delete: roleInfo.organization.delete || false,
		},
	});

	const onRoleDeleteClick = useCallback(() => {
		deleteOrganizationRole(
			{ roleId: data.id },
			{
				onSuccess: () => {
					toast.success('Role deleted successfully!');
					closeModal(true);
					form.reset();
				},
				onError: (error: Error | unknown) => {
					toast.error('Error', {
						description: `Failed to delete role: ${error instanceof Error ? error.message : String(error)}.`,
						action: {
							label: 'Dismiss',
							onClick: () => toast.dismiss(),
						},
					});
				},
			},
		);
	}, [data.id, deleteOrganizationRole, form, closeModal]);

	const [isValidJSON, setIsValidJSON] = useState(true);
	const initialPermissions = useMemo(
		() =>
			JSON.stringify(
				{
					roles: { ...roleInfo.organization.roles },
					clusters: { ...roleInfo.organization.clusters },
				} satisfies OrganizationRoleSpecificPermissionsType,
				null,
				2,
			),
		[roleInfo],
	);
	const [updatedPermissions, setUpdatedPermissions] = useState<string>(initialPermissions);
	const isPermissionsDirty = updatedPermissions !== initialPermissions;

	const onValidate = useCallback(
		(markers: unknown[]) => {
			setIsValidJSON(markers.length === 0);
		},
		[setIsValidJSON],
	);

	const onSubmitRoleEdits = useCallback(
		async (formData: OrganizationRoleOverviewType) => {
			if (!update) {
				return;
			}
			const parsedPermissions = safeParse<OrganizationRoleSpecificPermissionsType>(updatedPermissions);
			if (!parsedPermissions) {
				return;
			}
			const updatedFormData: OrganizationRoleUpdatePayloadType = {
				...formData,
				...parsedPermissions,
				organizationId: data.organizationId,
			};

			if (updatedPermissions && isValidJSON) {
				updateOrganizationRole(
					{
						roleId: data.id,
						updatedRoleInfo: updatedFormData,
					},
					{
						onSuccess: async () => {
							toast.success('Role updated successfully!');
							await queryClient.invalidateQueries({
								queryKey: [data.organizationId, 'roles', data.id],
							});
							closeModal(false);
							form.reset();
						},
						onError: (error: Error | unknown) => {
							toast.error('Error', {
								description: `Failed to update role: ${error instanceof Error ? error.message : String(error)}.`,
								action: {
									label: 'Dismiss',
									onClick: () => toast.dismiss(),
								},
							});
						},
					},
				);
			}
		},
		[
			closeModal,
			data.id,
			data.organizationId,
			form,
			isValidJSON,
			queryClient,
			roleInfo,
			update,
			updatedPermissions,
			updateOrganizationRole,
		],
	);

	return isConfirmingRoleDeletion
		? (
			<ConfirmDeletionContent
				onRoleDeleteClick={onRoleDeleteClick}
				setIsConfirmingRoleDeletion={setIsConfirmingRoleDeletion}
				isRoleDeletionPending={isRoleDeletionPending}
			/>
		)
		: (
			<>
				<DialogTitle>{isSelf || !update ? 'View' : 'Edit'} Organization Role "{data.roleName}"</DialogTitle>
				<Form {...form}>
					<form
						id="org-edit-role-form"
						name="org-edit-role-form"
						className="flex flex-1 min-h-0 flex-col gap-4 my-4"
						onSubmit={form.handleSubmit(onSubmitRoleEdits)}
					>
						<div className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem className="col-span-2">
										<FormLabel className="pb-1">Role Name</FormLabel>
										<FormControl>
											<Input
												type="text"
												className=""
												{...field}
												disabled={true}
												readOnly={true}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="update"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Can Update Organization</FormLabel>
										<FormControl>
											<Input
												type="checkbox"
												className="w-6 ml-2"
												disabled={isSelf || !update}
												readOnly={isSelf || !update}
												checked={field.value}
												onChange={(e) => field.onChange(e.target.checked)}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="delete"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Can Delete Organization</FormLabel>
										<FormControl>
											<Input
												type="checkbox"
												className="w-6 ml-2"
												disabled={isSelf || !update}
												readOnly={isSelf || !update}
												checked={field.value}
												onChange={(e) => field.onChange(e.target.checked)}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex-1 min-h-0">
							<Editor
								className="w-full h-full"
								theme={monacoTheme}
								defaultLanguage="json"
								onValidate={onValidate}
								onChange={(value) => {
									if (value) {
										setUpdatedPermissions(value);
									}
								}}
								options={{ readOnly: isSelf || !update, automaticLayout: true }}
								defaultValue={updatedPermissions}
							/>
						</div>
						{(!isSelf && (remove || update)) && (
							<DialogFooter>
								<div className="flex justify-between w-full">
									{remove && (
										<Button
											type="button"
											variant="destructiveOutline"
											onClick={() => setIsConfirmingRoleDeletion(true)}
											disabled={isRoleUpdatePending}
										>
											Delete Role
										</Button>
									)}
									{update && (
										<Button
											variant="submit"
											disabled={!isValidJSON || isRoleUpdatePending || !form.formState.isValid
												|| (!form.formState.isDirty && !isPermissionsDirty)}
										>
											Save Changes
										</Button>
									)}
								</div>
							</DialogFooter>
						)}
					</form>
				</Form>
			</>
		);
}

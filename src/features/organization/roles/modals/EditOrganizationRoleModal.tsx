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
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { SchemaOrganizationRole } from '@/integrations/api/api.gen';
import { safeParse } from '@/lib/string/safeParse';
import { zodResolver } from '@hookform/resolvers/zod';
import { Editor } from '@monaco-editor/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
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
	const { data: roleInfo } = useSuspenseQuery(
		getOrganizationRoleInfoQueryOptions({ roleId: data.id, organizationId: data.organizationId }),
	);
	const auth = useCloudAuth();
	const isSelf = auth.user && auth.user?.roles?.[data.organizationId]?.role === data.roleName;
	const { update, remove } = useOrganizationRolePermissions(data.organizationId);
	const { mutate: updateOrganizationRole, isPending: isRoleUpdatePending } = useUpdateOrganizationRole();
	const { mutate: deleteOrganizationRole, isPending: isRoleDeletionPending } = useDeleteOrganizationRole();

	const [isConfirmingRoleDeletion, setIsConfirmingRoleDeletion] = useState(false);

	const form = useForm({
		resolver: zodResolver(OrganizationRoleOverviewSchema),
		defaultValues: {
			name: data.roleName,
			update: roleInfo?.organization.update || false,
			delete: roleInfo?.organization.delete || false,
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
	const [updatedPermissions, setUpdatedPermissions] = useState<string>(
		JSON.stringify(
			{
				roles: { ...roleInfo.organization.roles },
				clusters: { ...roleInfo.organization.clusters },
			} satisfies OrganizationRoleSpecificPermissionsType,
			null,
			2,
		),
	);

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
						onSuccess: () => {
							toast.success('Role updated successfully!');
							closeModal(true);
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
			roleInfo,
			update,
			updatedPermissions,
			updateOrganizationRole,
		],
	);

	const onOpenChanges = useCallback(() => closeModal(false), [closeModal]);

	return (
		<Dialog onOpenChange={onOpenChanges} open={isModalOpen}>
			<DialogContent>
				{isConfirmingRoleDeletion
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
								<form className="grid grid-cols-2 gap-4 my-4" onSubmit={form.handleSubmit(onSubmitRoleEdits)}>
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
									<div className="col-span-2">
										<Editor
											theme="vs-dark"
											height="300px"
											defaultLanguage="json"
											onValidate={onValidate}
											onChange={(value) => {
												if (value) {
													setUpdatedPermissions(value);
												}
											}}
											options={isSelf || !update ? { readOnly: true } : undefined}
											defaultValue={updatedPermissions}
										/>
									</div>
									{(!isSelf && (remove || update)) && (
										<DialogFooter className="col-span-2">
											<div className="flex justify-between w-full">
												{remove && (
													<Button
														type="button"
														variant="destructiveOutline"
														className="rounded-full"
														onClick={() => setIsConfirmingRoleDeletion(true)}
														disabled={isRoleUpdatePending}
													>
														Delete Role
													</Button>
												)}
												{update && (
													<Button
														variant="submit"
														className="rounded-full"
														disabled={!isValidJSON || isRoleUpdatePending || !form.formState.isValid
															|| !form.formState.isDirty}
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
					)}
			</DialogContent>
		</Dialog>
	);
}

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { getOrganizationRoleInfoQueryOptions } from '@/features/organization/queries/getOrganizationRoleInfo';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { SchemaOrganizationRole } from '@/lib/api.gen';
import { Editor } from '@monaco-editor/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
	UpdateOrganizationRoleSchema,
	useUpdateOrganizationRole,
} from '@/features/organization/mutations/updateOrganizationRole';
import { useDeleteOrganizationRole } from '@/features/organization/mutations/deleteOrganizationRole';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';

const ConfirmDeletionContent = ({
	onRoleDeleteClick,
	setIsConfirmingRoleDeletion,
	isRoleDeletionPending,
}: {
	onRoleDeleteClick: () => void;
	setIsConfirmingRoleDeletion: (isOpen: boolean) => void;
	isRoleDeletionPending: boolean;
}) => (
	<>
		<DialogTitle>Confirm Role Deletion</DialogTitle>
		<DialogDescription>Are you sure you want to delete this role? This action cannot be undone.</DialogDescription>
		<DialogFooter>
			<Button variant="defaultOutline" className="rounded-full" onClick={() => setIsConfirmingRoleDeletion(false)}>
				Cancel
			</Button>
			<Button
				variant="destructiveOutline"
				className="rounded-full"
				onClick={onRoleDeleteClick}
				disabled={isRoleDeletionPending}
			>
				{isRoleDeletionPending ? 'Deleting...' : 'Delete Role'}
			</Button>
		</DialogFooter>
	</>
);

export function EditOrganizationRoleModal({
	data,
	isModalOpen,
	closeModal,
	roleDeleted,
}: {
	data: SchemaOrganizationRole;
	isModalOpen: boolean;
	closeModal: () => void;
	roleDeleted: () => void;
}) {
	const { data: roleInfo } = useSuspenseQuery(
		getOrganizationRoleInfoQueryOptions({ roleId: data.id, organizationId: data.organizationId })
	);
	const { update, remove } = useOrganizationRolePermissions(data.organizationId);
	const { mutate: updateOrganizationRole, isPending: isRoleUpdatePending } = useUpdateOrganizationRole();
	const { mutate: deleteOrganizationRole, isPending: isRoleDeletionPending } = useDeleteOrganizationRole();

	const [isConfirmingRoleDeletion, setIsConfirmingRoleDeletion] = useState(false);

	const onRoleDeleteClick = useCallback(() => {
		deleteOrganizationRole(
			{ roleId: data.id },
			{
				onSuccess: () => {
					toast.success('Role deleted successfully!');
					roleDeleted();
					closeModal();
				},
				onError: (error: Error) => {
					toast.error('Error', {
						description: `Failed to delete role: ${error instanceof Error ? error.message : String(error)}.`,
						action: {
							label: 'Dismiss',
							onClick: () => toast.dismiss(),
						},
					});
				},
			}
		);
	}, [data.id, deleteOrganizationRole, roleDeleted, closeModal]);

	const [isValidJSON, setIsValidJSON] = useState(true);
	const [updatedPermissions, setUpdatedPermissions] = useState<string>(
		JSON.stringify(
			{
				roles: { ...roleInfo.organization.roles },
				clusters: { ...roleInfo.organization.clusters },
			},
			null,
			2
		)
	);

	const form = useForm<z.infer<typeof UpdateOrganizationRoleSchema>>({
		resolver: zodResolver(UpdateOrganizationRoleSchema),
		defaultValues: {
			roleName: roleInfo.role as string,
			updateOrganization: roleInfo?.organization.update || false,
			deleteOrganization: roleInfo?.organization.delete || false,
		},
	});

	const onValidate = useCallback(
		(markers: unknown[]) => {
			setIsValidJSON(markers.length === 0);
		},
		[setIsValidJSON]
	);

	const onSubmitRoleEdits = useCallback(
		async (formData: z.infer<typeof UpdateOrganizationRoleSchema>) => {
			if (!update) {
				return;
			}
			const updatedRoleObject = { ...roleInfo };
			updatedRoleObject.organizationId = data.organizationId;
			updatedRoleObject.name = formData.roleName;
			updatedRoleObject.role = formData.roleName;
			updatedRoleObject.organization.roles = JSON.parse(updatedPermissions).roles;
			updatedRoleObject.organization.clusters = JSON.parse(updatedPermissions).clusters;
			updatedRoleObject.organization.update = formData.updateOrganization;
			updatedRoleObject.organization.delete = formData.deleteOrganization;

			if (updatedPermissions && isValidJSON) {
				updateOrganizationRole(
					{
						roleId: data.id,
						updatedRoleInfo: updatedRoleObject,
					},
					{
						onSuccess: () => {
							toast.success('Role updated successfully!');
							closeModal();
						},
						onError: (error: Error) => {
							toast.error('Error', {
								description: `Failed to update role: ${error instanceof Error ? error.message : String(error)}.`,
								action: {
									label: 'Dismiss',
									onClick: () => toast.dismiss(),
								},
							});
						},
					}
				);
			}
		},
		[update, roleInfo, data.organizationId, data.id, updatedPermissions, isValidJSON, updateOrganizationRole, closeModal]
	);

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent>
				{isConfirmingRoleDeletion ? (
					<ConfirmDeletionContent
						onRoleDeleteClick={onRoleDeleteClick}
						setIsConfirmingRoleDeletion={setIsConfirmingRoleDeletion}
						isRoleDeletionPending={isRoleDeletionPending}
					/>
				) : (
					<>
						<DialogTitle>Edit Organization Role "{roleInfo.role}"</DialogTitle>
						<Form {...form}>
							<form className="grid grid-cols-2 gap-4 my-4" onSubmit={form.handleSubmit(onSubmitRoleEdits)}>
								<FormField
									control={form.control}
									name="roleName"
									render={({ field }) => (
										<FormItem className="col-span-2">
											<FormLabel className="pb-1">Role Name</FormLabel>
											<FormControl>
												<Input type="text" placeholder="Developer" className="" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="updateOrganization"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="pb-1">Can Update Organization</FormLabel>
											<FormControl>
												<Input
													type="checkbox"
													className="w-6 ml-2"
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
									name="deleteOrganization"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="pb-1">Can Delete Organization</FormLabel>
											<FormControl>
												<Input
													type="checkbox"
													className="w-6 ml-2"
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
										defaultValue={updatedPermissions}
									/>
								</div>
								{(remove || update) && (<DialogFooter className="col-span-2">
									<div className="flex justify-between w-full">
										{remove && (<Button
											variant="destructiveOutline"
											className="rounded-full"
											onClick={() => setIsConfirmingRoleDeletion(true)}
											disabled={isRoleUpdatePending}
										>
											Delete Role
										</Button>)}
										{update && (<Button variant="submit" className="rounded-full" disabled={!isValidJSON || isRoleUpdatePending}>
											Save Changes
										</Button>)}
									</div>
								</DialogFooter>)}
							</form>
						</Form>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

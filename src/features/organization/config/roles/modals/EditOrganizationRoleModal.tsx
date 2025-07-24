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
import { OrganizationRole } from '@/lib/api.patch';
import { Editor } from '@monaco-editor/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { UpdateOrganizationRoleSchema, useUpdateOrganizationRole } from '../../mutations/updateOrganizationRole';
import { zodResolver } from '@hookform/resolvers/zod';

export function EditOrganizationRoleModal({
	data,
	isModalOpen,
	closeModal,
}: {
	data: OrganizationRole;
	isModalOpen: boolean;
	closeModal: () => void;
}) {
	const { data: roleInfo } = useSuspenseQuery(
		getOrganizationRoleInfoQueryOptions({ roleId: data.id, organizationId: data.organizationId })
	);
	const { mutate: updateOrganizationRole } = useUpdateOrganizationRole();

	const [isValidJSON, setIsValidJSON] = useState(true);
	const [updatedPermissions, setUpdatedPermissions] = useState<string>({
		roles: { ...roleInfo.organization.roles },
		clusters: { ...roleInfo.organization.clusters },
	});

	// console.log('roleInfo', roleInfo);

	const form = useForm<z.infer<typeof UpdateOrganizationRoleSchema>>({
		resolver: zodResolver(UpdateOrganizationRoleSchema),
		defaultValues: {
			roleName: roleInfo.role,
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
		async (formData: any) => {
			const updatedRoleObject = { ...roleInfo };
			updatedRoleObject.organization.roles = JSON.parse(updatedPermissions).roles;
			updatedRoleObject.organization.clusters = JSON.parse(updatedPermissions).clusters;
			updatedRoleObject.role = formData.roleName;
			updatedRoleObject.organization.update = formData.updateOrganization;
			updatedRoleObject.organization.delete = formData.deleteOrganization;

			console.log('updatedRoleObject', updatedRoleObject);
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
		[updatedPermissions, isValidJSON, closeModal, data.id, roleInfo, updateOrganizationRole]
	);

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent>
				<DialogTitle>Edit Organization Role "{roleInfo.role}"</DialogTitle>
				<DialogDescription>Edit the role's permissions in JSON format or remove the role entirely.</DialogDescription>
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
								defaultValue={JSON.stringify(updatedPermissions, null, 2)}
							/>
						</div>
						<DialogFooter className="col-span-2">
							<div className="flex justify-between w-full">
								<Button
									variant="destructiveOutline"
									className="rounded-full"
									// onClick={onRoleDeleteClick}
									// disabled={isPending}
								>
									Delete Role
								</Button>
								<Button variant="submit" className="rounded-full" disabled={!isValidJSON}>
									Save Changes
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

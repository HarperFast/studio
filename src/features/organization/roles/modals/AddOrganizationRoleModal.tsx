import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useAddOrganizationRole } from '@/features/organization/mutations/addOrganizationRole';
import {
	OrganizationRoleOverviewSchema,
	OrganizationRoleOverviewType,
	OrganizationRoleSpecificPermissionsType,
	OrganizationRoleUpdatePayloadType,
} from '@/features/organization/mutations/OrganizationRoleFormSchema';
import { safeParse } from '@/lib/string/safeParse';
import { zodResolver } from '@hookform/resolvers/zod';
import { Editor } from '@monaco-editor/react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

const defaultPermissions: OrganizationRoleSpecificPermissionsType = {
	roles: {
		create: true,
		view: true,
		update: true,
		delete: true,
	},
	clusters: {
		create: true,
		view: true,
		update: true,
		delete: true,
		resources: [],
	},
};

export function AddOrganizationRoleModal({
	isModalOpen,
	setIsModalOpen,
}: {
	isModalOpen: boolean;
	setIsModalOpen: (isOpen: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const { organizationId }: { organizationId: string } = useParams({ strict: false });
	const [isValidJSON, setIsValidJSON] = useState(true);
	const [updatedPermissions, setUpdatedPermissions] = useState<string>(JSON.stringify(defaultPermissions, null, 2));

	const { mutate: addOrganizationRole, isPending } = useAddOrganizationRole();

	const form = useForm({
		resolver: zodResolver(OrganizationRoleOverviewSchema),
		defaultValues: {
			name: '',
			update: false,
			delete: false,
		},
	});

	const onValidate = useCallback(
		(markers: unknown[]) => {
			setIsValidJSON(markers.length === 0);
		},
		[setIsValidJSON],
	);

	const onSubmitRoleEdits = useCallback(
		async (formData: OrganizationRoleOverviewType) => {
			const parsedPermissions = safeParse<OrganizationRoleSpecificPermissionsType>(updatedPermissions);
			if (!parsedPermissions) {
				return;
			}
			const updatedFormData: OrganizationRoleUpdatePayloadType = {
				...formData,
				...parsedPermissions,
				organizationId: organizationId,
			};
			if (formData && isValidJSON) {
				addOrganizationRole(updatedFormData, {
					onSuccess: () => {
						toast.success('Organization role added successfully!');
						setIsModalOpen(false);
						void queryClient.invalidateQueries({
							queryKey: [organizationId, 'roles'],
							refetchType: 'active',
						});
						form.reset();
					},
					onError: (error: Error) => {
						toast.error(`Failed to add organization role: ${error.message}`);
					},
				});
			}
		},
		[isValidJSON, updatedPermissions, addOrganizationRole, form, queryClient, setIsModalOpen, organizationId],
	);

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			<DialogContent>
				<DialogTitle>Add New Organization Role</DialogTitle>
				<DialogDescription>Set the new organization role permissions.</DialogDescription>
				<Form {...form}>
					<form className="grid grid-cols-2 gap-4 my-4" onSubmit={form.handleSubmit(onSubmitRoleEdits)}>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem className="col-span-2">
									<FormLabel className="pb-1">Role Name</FormLabel>
									<FormControl>
										<Input type="text" className="" {...field} />
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
								defaultValue={JSON.stringify(defaultPermissions, null, 2)}
							/>
						</div>
						<DialogFooter className="col-span-2">
							<div className="flex justify-between w-full">
								<Button
									variant="destructiveOutline"
									className="rounded-full"
									type="button"
									onClick={() => setIsModalOpen(false)}
									disabled={isPending}
								>
									Cancel
								</Button>
								<Button
									variant="submit"
									className="rounded-full"
									disabled={isPending || !isValidJSON || !form.formState.isValid}
								>
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

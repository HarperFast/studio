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
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { Editor } from '@/lib/monaco/MonacoEditor';
import { safeParse } from '@/lib/string/safeParse';
import { zodResolver } from '@hookform/resolvers/zod';
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
	const monacoTheme = useMonacoTheme();
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
			<DialogContent resizable>
				<DialogTitle>Add New Organization Role</DialogTitle>
				<DialogDescription>Set the new organization role permissions.</DialogDescription>
				<Form {...form}>
					<form
						id="org-add-role-form"
						name="org-add-role-form"
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
								options={{ automaticLayout: true }}
								defaultValue={JSON.stringify(defaultPermissions, null, 2)}
							/>
						</div>
						<DialogFooter>
							<div className="flex justify-between w-full">
								<Button
									variant="destructiveOutline"
									type="button"
									onClick={() => setIsModalOpen(false)}
									disabled={isPending}
								>
									Cancel
								</Button>
								<Button
									variant="submit"
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

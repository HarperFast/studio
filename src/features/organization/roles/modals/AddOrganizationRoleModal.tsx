import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { LengthLimitedInput } from '@/components/ui/form/LengthLimitedInput';
import { revealFieldErrorOnEnter } from '@/components/ui/form/revealFieldErrorOnEnter';
import { useAddOrganizationRole } from '@/features/organization/mutations/addOrganizationRole';
import { OrganizationRoleNameSchema } from '@/features/organization/mutations/OrganizationRoleFormSchema';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { RolePermissionsEditor } from '@/features/organization/roles/components/RolePermissionsEditor';
import { NEW_ROLE_PERMISSIONS, RolePermissions, toPayload } from '@/features/organization/roles/rolePermissions';
import { shouldToastOwnFailure } from '@/react-query/queryClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

export function AddOrganizationRoleModal({
	isModalOpen,
	setIsModalOpen,
}: {
	isModalOpen: boolean;
	setIsModalOpen: (isOpen: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const { organizationId }: { organizationId: string } = useParams({ strict: false });
	const { data: organization } = useQuery(getOrganizationQueryOptions(organizationId));
	const [permissions, setPermissions] = useState<RolePermissions>(NEW_ROLE_PERMISSIONS);
	const [isPermissionsValid, setIsPermissionsValid] = useState(true);
	const { mutate: addOrganizationRole, isPending } = useAddOrganizationRole();

	const form = useForm({
		resolver: zodResolver(OrganizationRoleNameSchema),
		mode: 'onTouched',
		defaultValues: { name: '' },
	});

	const close = () => {
		setIsModalOpen(false);
		form.reset();
		setPermissions(NEW_ROLE_PERMISSIONS);
		setIsPermissionsValid(true);
	};

	const onSubmit = ({ name }: { name: string }) =>
		addOrganizationRole(toPayload(name, organizationId, permissions), {
			onSuccess: () => {
				toast.success(`Role "${name}" created.`);
				void queryClient.invalidateQueries({ queryKey: [organizationId, 'roles'], refetchType: 'active' });
				close();
			},
			onError: (error: Error) => {
				if (shouldToastOwnFailure(error)) {
					toast.error(`Failed to create the role: ${error.message}`);
				}
			},
		});

	return (
		<Dialog onOpenChange={(open) => !open && close()} open={isModalOpen}>
			<DialogContent
				className="max-h-[90vh] overflow-y-auto focus:outline-none sm:max-w-[760px]"
				// Focus the dialog, not the role name: an autofocused name counts as visited, so the first click
				// anywhere else would report it empty before anything was typed.
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					(event.currentTarget as HTMLElement).focus();
				}}
			>
				<DialogTitle>Create role</DialogTitle>
				<DialogDescription>Choose what this role can access.</DialogDescription>
				<Form {...form}>
					<form
						id="org-add-role-form"
						name="org-add-role-form"
						className="flex flex-col gap-4 my-2"
						onSubmit={form.handleSubmit(onSubmit)}
						onKeyDown={revealFieldErrorOnEnter(form)}
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Role name</FormLabel>
									<LengthLimitedInput
										type="text"
										placeholder="e.g. deployment_operator"
										maxLength={OrganizationRoleNameSchema.shape.name.maxLength!}
										{...field}
									/>
									<FormDescription>Letters and underscores, up to 30 characters.</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<RolePermissionsEditor
							value={permissions}
							onChange={setPermissions}
							onValidChange={setIsPermissionsValid}
							clusters={organization?.clusters ?? []}
						/>
						<DialogFooter>
							<div className="flex justify-between w-full">
								<Button variant="outline" type="button" onClick={close} disabled={isPending}>
									Cancel
								</Button>
								<Button variant="submit" disabled={isPending || !isPermissionsValid || !form.formState.isValid}>
									{isPending ? 'Creating…' : 'Create role'}
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

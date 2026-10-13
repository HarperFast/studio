import { RoleOptionLabel } from '@/components/RoleOptionLabel';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { LengthLimitedInput } from '@/components/ui/form/LengthLimitedInput';
import { revealFieldErrorOnEnter } from '@/components/ui/form/revealFieldErrorOnEnter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getOrganizationRolesQueryOptions } from '@/features/organization/queries/getOrganizationRoles';
import { useCreateServiceAccountMutation } from '@/features/organization/serviceAccounts/mutations/serviceAccounts';
import { ServiceAccount } from '@/integrations/api/api.patch';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const CreateServiceAccountSchema = z.object({
	name: z
		.string()
		.trim()
		.nonempty({ error: 'Please enter a name.' })
		.max(100, { error: 'Name cannot be longer than 100 characters.' }),
	roleId: z.string().nonempty({ error: 'Please choose a role.' }),
});

type CreateServiceAccountForm = z.infer<typeof CreateServiceAccountSchema>;

export function CreateServiceAccountModal({
	organizationId,
	onClose,
	onCreated,
}: {
	organizationId: string;
	onClose: () => void;
	onCreated: (serviceAccount: ServiceAccount) => void;
}) {
	const { mutate: createServiceAccount, isPending } = useCreateServiceAccountMutation(organizationId);
	// Validation is async, so a submit can resume after Cancel or a second submit: both are checked here,
	// synchronously, since isPending lags a render.
	const isMounted = useRef(false);
	const isSubmitting = useRef(false);
	useEffect(() => {
		isMounted.current = true;
		return () => {
			isMounted.current = false;
		};
	}, []);
	const { data: roles, isLoading: isRolesLoading } = useQuery(getOrganizationRolesQueryOptions(organizationId));

	const form = useForm<CreateServiceAccountForm>({
		resolver: zodResolver(CreateServiceAccountSchema),
		mode: 'onTouched',
		defaultValues: { name: '', roleId: '' },
	});
	const { isValid } = form.formState;

	const onSubmit = (formData: CreateServiceAccountForm) => {
		if (isSubmitting.current || !isMounted.current) { return; }
		isSubmitting.current = true;
		createServiceAccount(
			{ organizationId, ...formData },
			{
				onSuccess: (serviceAccount) => {
					toast.success(`Service account "${serviceAccount.name}" created.`);
					onCreated(serviceAccount);
				},
				onError: () => {
					isSubmitting.current = false;
				},
			},
		);
	};

	const closeUnlessSubmitting = () => {
		if (!isSubmitting.current) { onClose(); }
	};

	return (
		<Dialog open onOpenChange={(open) => !open && closeUnlessSubmitting()}>
			<DialogContent className="sm:max-w-[600px]">
				<DialogTitle>Create Service Account</DialogTitle>
				<DialogDescription>
					A non-human member of this organization for CI pipelines and scripts. It acts with the role you give it.
				</DialogDescription>
				<Form {...form}>
					<form
						id="create-service-account-form"
						name="create-service-account-form"
						className="flex flex-col gap-4 my-4"
						onSubmit={form.handleSubmit(onSubmit)}
						onKeyDown={revealFieldErrorOnEnter(form)}
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Name</FormLabel>
									<LengthLimitedInput
										type="text"
										placeholder="e.g. github-actions"
										maxLength={CreateServiceAccountSchema.shape.name.maxLength!}
										{...field}
									/>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="roleId"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Role</FormLabel>
									{isRolesLoading
										? <TextLoadingSkeleton />
										: (
											<Select value={field.value} onValueChange={(roleId) => field.onChange(roleId)}>
												<FormControl>
													<SelectTrigger className="w-full" aria-label="Role">
														<SelectValue placeholder="Choose a role" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{roles?.map((role) => (
														<SelectItem key={role.id} value={role.id}>
															<RoleOptionLabel name={role.roleName} id={role.id} />
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										)}
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<div className="flex justify-between w-full">
								<Button variant="destructiveOutline" type="button" onClick={closeUnlessSubmitting} disabled={isPending}>
									Cancel
								</Button>
								<Button variant="submit" type="submit" disabled={isPending || !isValid}>
									{isPending ? 'Creating…' : 'Create Service Account'}
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

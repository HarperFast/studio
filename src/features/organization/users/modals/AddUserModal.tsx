import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	AddOrganizationRoleSchema,
	useAddUserToOrganizationRole,
} from '@/features/organization/mutations/addUserToOrganizationRole';
import { useInviteUserToOrganizationRole } from '@/features/organization/mutations/inviteUserToOrganizationRole';
import { getOrganizationRolesQueryOptions } from '@/features/organization/queries/getOrganizationRoles';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { AxiosError } from 'axios';
import { MailWarningIcon, Save } from 'lucide-react';
import { Suspense, useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const route = getRouteApi('');

export function AddUserModal({
	isModalOpen,
	onChangesSaved,
	setIsModalOpen,
}: {
	isModalOpen: boolean;
	onChangesSaved: () => void;
	setIsModalOpen: (open: boolean) => void;
}) {
	const { organizationId } = route.useParams();
	const { data: orgRoles } = useSuspenseQuery(getOrganizationRolesQueryOptions(organizationId));
	const [shouldInvite, setShouldInvite] = useState(false);

	const form = useForm<z.infer<typeof AddOrganizationRoleSchema>>({
		resolver: zodResolver(AddOrganizationRoleSchema),
		defaultValues: {
			email: '',
			roleId: '',
		},
	});
	const { mutate: addUser, isPending: isAddPending } = useAddUserToOrganizationRole();
	const { mutate: inviteUser, isPending: isInvitePending } = useInviteUserToOrganizationRole();

	const onSubmitClick = useCallback(
		async (formData: z.infer<typeof AddOrganizationRoleSchema>) => {
			if (formData) {
				(shouldInvite ? inviteUser : addUser)(formData, {
					onSuccess: () => {
						const lastRole = formData.roleId;
						form.reset();
						// Persist the selected role if they open the form again.
						form.setValue('roleId', lastRole);
						onChangesSaved();
						toast.success('User invited successfully!');
						setIsModalOpen(false);
						setShouldInvite(false);
					},
					onError: (error) => {
						if ((error as AxiosError)?.status === 404) {
							setShouldInvite(true);
						}
					},
				});
			}
		},
		[addUser, form, inviteUser, onChangesSaved, setIsModalOpen, shouldInvite]
	);

	return (
		<Dialog
			onOpenChange={() => {
				setIsModalOpen(false);
				setShouldInvite(false);
				form.reset();
			}}
			open={isModalOpen}
		>
			<DialogContent aria-describedby={undefined}>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmitClick)} className="grid gap-4 my-4">
						<DialogHeader>
							<DialogTitle>{shouldInvite ? 'Invite User' : 'Add User'}</DialogTitle>
						</DialogHeader>
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Email</FormLabel>
									<FormControl>
										<Input type="email" enterKeyHint="next" autoComplete="email" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="roleId"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Roles</FormLabel>

									<Suspense fallback={<TextLoadingSkeleton />}>
										<FormControl>
											<Select {...field} onValueChange={(role) => field.onChange(role)}>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Choose Role" />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														{/*TODO: Multi select*/}
														<SelectLabel>Role</SelectLabel>
														{orgRoles?.map((role) => (
															<SelectItem key={role.id} value={role.id}>
																{role.roleName}
															</SelectItem>
														))}
													</SelectGroup>
												</SelectContent>
											</Select>
										</FormControl>
									</Suspense>
									<FormMessage />
								</FormItem>
							)}
						/>

						{shouldInvite && (
							<DialogDescription className="p-3 my-5 text-white rounded-md bg-amber-600 flex">
								<MailWarningIcon className="inline-block size-12 pr-2" />
								<span>This person doesn’t have a Fabric account. Do you want to invite them?</span>
							</DialogDescription>
						)}

						<DialogFooter>
							<div className="flex justify-between w-full">
								<Button
									type="submit"
									variant="submit"
									className="rounded-full"
									disabled={isAddPending || isInvitePending}
								>
									<Save /> {shouldInvite ? 'Invite User' : 'Add User'}
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

import { RoleOptionLabel } from '@/components/RoleOptionLabel';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormDescription } from '@/components/ui/form/FormDescription';
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
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { RoleOperationsSummary } from '@/features/instance/config/roles/operations/RoleOperationsSummary';
import { useRoleBlocksAssignment } from '@/features/instance/config/roles/operations/useRoleBlocksAssignment';
import { useListedRoles } from '@/features/instance/config/users/useListedRoles';
import { useAddUserMutation } from '@/integrations/api/instance/auth/addUser';
import { AddUserFormSchema } from '@/integrations/api/instance/auth/addUserFormSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

export function AddUserModal({
	isModalOpen,
	onChangesSaved,
	setIsModalOpen,
}: {
	isModalOpen: boolean;
	onChangesSaved: () => void;
	setIsModalOpen: (open: boolean) => void;
}) {
	const instanceParams = useInstanceClientIdParams();
	const { canList: canListRoles, roles, isLoading: isRolesLoading } = useListedRoles();
	const form = useForm({
		resolver: zodResolver(AddUserFormSchema),
		defaultValues: {
			username: '',
			role: '',
			password: '',
			confirmPassword: '',
		},
	});
	const { mutate: addUser, isPending: isAddPending } = useAddUserMutation();
	// Assigning a role whose operations value Harper cannot expand takes authentication down for
	// every user, so the form refuses rather than only warning.
	const selectedRoleId = form.watch('role');
	const assignmentBlocked = useRoleBlocksAssignment(roles?.find((role) => role.id === selectedRoleId));

	const onSubmitClick = useCallback(async (formData: z.infer<typeof AddUserFormSchema>) => {
		if (formData) {
			addUser(
				{
					active: true,
					password: formData.password,
					role: formData.role,
					username: formData.username,
					...instanceParams,
				},
				{
					onSuccess: () => {
						const lastRole = formData.role;
						form.reset();
						// Persist the selected role if they open the form again.
						form.setValue('role', lastRole);
						onChangesSaved();
						toast.success('User added successfully!');
						setIsModalOpen(false);
					},
				},
			);
		}
	}, [addUser, form, instanceParams, onChangesSaved, setIsModalOpen]);

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			{/* NOTE - Is this okay to do for the aria describedby? */}
			<DialogContent aria-describedby={undefined}>
				<Form {...form}>
					<form
						id="instance-add-user-form"
						name="instance-add-user-form"
						onSubmit={form.handleSubmit(onSubmitClick)}
						className="grid gap-4 my-4"
					>
						<DialogHeader>
							<DialogTitle>Add New User</DialogTitle>
						</DialogHeader>
						<FormField
							control={form.control}
							name="username"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Username</FormLabel>
									<FormControl>
										<Input
											type="text"
											enterKeyHint="next"
											autoComplete="username"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="password"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Password</FormLabel>
									<FormControl>
										<Input
											type="password"
											enterKeyHint="next"
											autoComplete="new-password"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="confirmPassword"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Confirm Password</FormLabel>
									<FormControl>
										<Input
											type="password"
											enterKeyHint="next"
											autoComplete="new-password"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="role"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Role</FormLabel>

									{isRolesLoading ? <TextLoadingSkeleton /> : (
										<FormControl>
											<Select
												{...field}
												onValueChange={(role) => field.onChange(role)}
												disabled={canListRoles === false}
											>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Choose Role" />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														<SelectLabel>Role</SelectLabel>
														{roles?.map((role) => (
															<SelectItem
																key={role.id}
																value={role.id}
															>
																<RoleOptionLabel name={role.role} id={role.id} />
															</SelectItem>
														))}
													</SelectGroup>
												</SelectContent>
											</Select>
										</FormControl>
									)}
									{canListRoles === false && (
										<FormDescription>Choosing a role needs list_roles, which your role doesn't have.</FormDescription>
									)}
									<RoleOperationsSummary role={roles?.find((role) => role.id === field.value)} />
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<div className="flex justify-between w-full">
								<Button
									type="submit"
									variant="submit"
									disabled={isAddPending || isRolesLoading || assignmentBlocked || canListRoles === false}
								>
									<Save /> Add User
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

import { RoleOptionLabel } from '@/components/RoleOptionLabel';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { Switch } from '@/components/ui/switch';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { RoleOperationsSummary } from '@/features/instance/config/roles/operations/RoleOperationsSummary';
import { useRoleBlocksAssignment } from '@/features/instance/config/roles/operations/useRoleBlocksAssignment';
import { LocalUser } from '@/integrations/api/api.patch';
import { AlterUserRequestBody, useAlterUser } from '@/integrations/api/instance/auth/alterUser';
import { AlterUserFormSchema } from '@/integrations/api/instance/auth/alterUserFormSchema';
import { getListRolesQueryOptions } from '@/integrations/api/instance/auth/getListRoles';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

export type ActiveToggle = 'hidden' | 'editable' | 'only-active-super-user';

export function AlterUserForm({
	data,
	activeToggle,
	onUserUpdated,
}: {
	data: LocalUser;
	activeToggle: ActiveToggle;
	onUserUpdated: () => void;
}) {
	const instanceParams = useInstanceClientIdParams();
	// Harper rejects any user whose `active` is falsy (`findAndValidateUser`), not only `false`.
	const isActive = Boolean(data.active);
	const { data: roles, isLoading: isRolesLoading } = useQuery({
		...getListRolesQueryOptions(instanceParams),
		// Keep the previous useSuspenseQuery behavior of surfacing fetch errors to the ErrorBoundary.
		throwOnError: true,
	});
	const { mutate: alterUser, isPending: isUpdateUserPending } = useAlterUser();
	const alterForm = useForm({
		resolver: zodResolver(AlterUserFormSchema),
		defaultValues: {
			username: data.username,
			role: data.role?.id ?? '',
			newPassword: '',
			confirmPassword: '',
			active: isActive,
		},
	});

	// Assigning a role whose operations value Harper cannot expand takes authentication down for
	// every user, so the form refuses rather than only warning.
	const selectedRoleId = alterForm.watch('role');
	const assignmentBlocked = useRoleBlocksAssignment(roles?.find((role) => role.id === selectedRoleId));

	const onSubmitClick = useCallback((formData: z.infer<typeof AlterUserFormSchema>) => {
		const alterBody: AlterUserRequestBody = {
			username: data.username,
			role: formData.role,
			...instanceParams,
		};
		if (formData.newPassword) {
			alterBody.password = formData.newPassword;
		}
		// Against the form's own starting value: `data` is re-polled while the form is open, so another admin's
		// change would otherwise read as this one's.
		if (activeToggle === 'editable' && formData.active !== alterForm.formState.defaultValues?.active) {
			alterBody.active = formData.active;
		}
		alterUser(
			alterBody,
			{
				onSuccess: () => {
					alterForm.reset();
					toast.success('User edited successfully!');
					onUserUpdated();
				},
			},
		);
	}, [activeToggle, alterForm, alterUser, data.username, instanceParams, onUserUpdated]);

	return (
		<Form {...alterForm}>
			<form
				id="instance-edit-user-form"
				name="instance-edit-user-form"
				onSubmit={alterForm.handleSubmit(onSubmitClick)}
				className="@container grid gap-4 my-4"
			>
				<DialogHeader>
					<DialogTitle>Edit User</DialogTitle>
				</DialogHeader>

				{/* Columns follow the dialog's own width, not the window's, because the dialog resizes. */}
				<div className="grid gap-4 @2xl:grid-cols-2 @2xl:gap-x-8">
					<div className="grid content-start gap-4">
						<FormField
							control={alterForm.control}
							name="username"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Username</FormLabel>
									<FormControl>
										<Input
											type="text"
											enterKeyHint="next"
											autoComplete="username"
											disabled={true}
											readOnly={true}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={alterForm.control}
							name="role"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Role</FormLabel>

									{isRolesLoading ? <TextLoadingSkeleton /> : (
										<FormControl>
											<Select {...field} onValueChange={(role) => field.onChange(role)}>
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
									<RoleOperationsSummary role={roles?.find((role) => role.id === field.value)} />
									<FormMessage />
								</FormItem>
							)}
						/>

						{activeToggle !== 'hidden' && (
							<FormField
								control={alterForm.control}
								name="active"
								render={({ field }) => (
									<FormItem className="flex items-center justify-between gap-4">
										<div className="grid gap-1">
											<FormLabel>Active</FormLabel>
											<FormDescription>
												{activeToggle === 'only-active-super-user'
													? "This is the only active super user, so it can't be deactivated."
													: "Inactive users can't sign in. Their role and password are kept."}
											</FormDescription>
										</div>
										<FormControl>
											<Switch
												name={field.name}
												checked={field.value}
												onCheckedChange={field.onChange}
												onBlur={field.onBlur}
												ref={field.ref}
												disabled={activeToggle === 'only-active-super-user'}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
						)}
					</div>
					<div className="grid content-start gap-4">
						<FormField
							control={alterForm.control}
							name="newPassword"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Change Password</FormLabel>
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
							control={alterForm.control}
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
					</div>
				</div>

				{/* The body scrolls, so keep Save in view when the form runs past the dialog's saved height. */}
				<DialogFooter className="sticky bottom-0 bg-popover py-2">
					<div className="flex justify-between w-full">
						<Button
							variant="submit"
							disabled={isUpdateUserPending || assignmentBlocked}
						>
							<Save /> Save Changes
						</Button>
					</div>
				</DialogFooter>
			</form>
		</Form>
	);
}

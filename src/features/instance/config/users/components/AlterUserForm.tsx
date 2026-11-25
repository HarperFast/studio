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
import { useListedRoles } from '@/features/instance/config/users/useListedRoles';
import { LocalUser } from '@/integrations/api/api.patch';
import { AlterUserRequestBody, useAlterUser } from '@/integrations/api/instance/auth/alterUser';
import {
	AlterUserFixedRoleFormSchema,
	AlterUserFormSchema,
} from '@/integrations/api/instance/auth/alterUserFormSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useCallback, useEffect } from 'react';
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
	const { canList: canListRoles, roles, isLoading: isRolesLoading } = useListedRoles();
	const isRoleReadOnly = canListRoles === false;
	const sendsRole = canListRoles === true;
	const { mutate: alterUser, isPending: isUpdateUserPending } = useAlterUser();
	const alterForm = useForm({
		resolver: zodResolver(isRoleReadOnly ? AlterUserFixedRoleFormSchema : AlterUserFormSchema),
		defaultValues: {
			username: data.username,
			role: data.role?.id ?? '',
			newPassword: '',
			confirmPassword: '',
			active: isActive,
		},
	});

	// Follow the re-polled value until the editor touches the switch, so it never shows another admin's change
	// undone. resetField skips an unregistered field, so re-run when a hidden switch appears.
	useEffect(() => {
		if (!alterForm.getFieldState('active').isDirty) {
			alterForm.resetField('active', { defaultValue: isActive });
		}
	}, [activeToggle, alterForm, isActive]);

	// Assigning a role whose operations value Harper cannot expand takes authentication down for
	// every user, so the form refuses rather than only warning.
	const selectedRoleId = alterForm.watch('role');
	const assignmentBlocked = useRoleBlocksAssignment(roles?.find((role) => role.id === selectedRoleId));

	// Against the form's own starting value: `data` is re-polled while the form is open, so another admin's
	// change would otherwise read as this one's.
	const sendsActive = useCallback(
		(active: boolean) => activeToggle === 'editable' && active !== alterForm.formState.defaultValues?.active,
		[activeToggle, alterForm],
	);
	// Harper refuses an alter_user with no password, role or active to update.
	const hasNothingToSend = !sendsRole && !alterForm.watch('newPassword') && !sendsActive(alterForm.watch('active'));

	const onSubmitClick = useCallback((formData: z.infer<typeof AlterUserFormSchema>) => {
		const alterBody: AlterUserRequestBody = {
			username: data.username,
			...instanceParams,
		};
		if (sendsRole) {
			alterBody.role = formData.role;
		}
		if (formData.newPassword) {
			alterBody.password = formData.newPassword;
		}
		if (sendsActive(formData.active)) {
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
	}, [alterForm, alterUser, data.username, instanceParams, onUserUpdated, sendsActive, sendsRole]);

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
											<Select
												{...field}
												// Read-only shows the re-polled role, which the form's starting value can fall behind.
												value={isRoleReadOnly ? data.role?.id ?? '' : field.value}
												onValueChange={(role) => field.onChange(role)}
												disabled={isRoleReadOnly}
											>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Choose Role" />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														<SelectLabel>Role</SelectLabel>
														{(isRoleReadOnly ? (data.role ? [data.role] : []) : roles)?.map((role) => (
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
									{isRoleReadOnly && (
										<FormDescription>Changing the role needs list_roles, which your role doesn't have.</FormDescription>
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
												checked={activeToggle === 'only-active-super-user' || field.value}
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

				<DialogFooter className="sticky bottom-0 bg-popover py-2">
					<div className="flex justify-between w-full">
						<Button
							variant="submit"
							disabled={isUpdateUserPending || isRolesLoading || assignmentBlocked || hasNothingToSend}
						>
							<Save /> Save Changes
						</Button>
					</div>
				</DialogFooter>
			</form>
		</Form>
	);
}

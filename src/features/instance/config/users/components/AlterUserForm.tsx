import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
	AlterUserFormSchema,
	AlterUserRequestBody,
	useAlterUser,
} from '@/features/instance/operations/mutations/alterUser';
import { getListRolesQueryOptions } from '@/features/instance/operations/queries/getListRoles';
import { LocalUser } from '@/lib/api.patch';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { Suspense, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

export function AlterUserForm({
	instanceId,
	data,
	onUserUpdated,
}: {
	instanceId: string;
	data: LocalUser;
	onUserUpdated: () => void;
}) {
	const { data: roles } = useSuspenseQuery(getListRolesQueryOptions(instanceId));
	const { mutate: alterUser, isPending: isUpdateUserPending } = useAlterUser();
	const alterForm = useForm<z.infer<typeof AlterUserFormSchema>>({
		resolver: zodResolver(AlterUserFormSchema),
		defaultValues: {
			username: data.username,
			role: data.role.role,
			newPassword: '',
			confirmPassword: '',
		},
	});

	const onSubmitClick = useCallback((formData: z.infer<typeof AlterUserFormSchema>) => {
		const alterBody: AlterUserRequestBody = {
			username: data.username,
			role: formData.role,
		};
		if (formData.newPassword) {
			alterBody.password = formData.newPassword;
		}
		alterUser(
			alterBody,
			{
				onSuccess: () => {
					alterForm.reset();
					toast.success('User edited successfully!');
					onUserUpdated();
				},
			});
	}, [alterForm, alterUser, data.username, onUserUpdated]);

	return <Form {...alterForm}>
		<form onSubmit={alterForm.handleSubmit(onSubmitClick)} className="grid gap-4 my-4">
			<DialogHeader>
				<DialogTitle>Edit User</DialogTitle>
			</DialogHeader>

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

			<FormField
				control={alterForm.control}
				name="role"
				render={({ field }) => (
					<FormItem>
						<FormLabel className="pb-1">Role</FormLabel>

						<Suspense fallback={<TextLoadingSkeleton />}>
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
												>{role.role}</SelectItem>
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

			<DialogFooter>
				<div className="flex justify-between w-full">
					<Button
						variant="submit"
						className="rounded-full"
						disabled={isUpdateUserPending}
					>
						<Save /> Save Changes
					</Button>
				</div>
			</DialogFooter>

		</form>
	</Form>
}

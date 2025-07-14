import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Save } from 'lucide-react';
import { Suspense, useCallback } from 'react';
import { AddUserFormSchema, useAddUserMutation } from '@/features/instance/operations/mutations/addUser';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getListRolesQueryOptions } from '@/features/instance/operations/queries/getListRoles';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

export function AddUserModal({
	instanceId,
	isModalOpen,
	onChangesSaved,
	setIsModalOpen,
}: {
	instanceId: string;
	isModalOpen: boolean;
	onChangesSaved: () => void;
	setIsModalOpen: (open: boolean) => void;
}) {
	const { data: roles } = useSuspenseQuery(getListRolesQueryOptions(instanceId));
	const form = useForm<z.infer<typeof AddUserFormSchema>>({
		resolver: zodResolver(AddUserFormSchema),
		defaultValues: {
			username: '',
			role: '',
			password: '',
			confirmPassword: '',
		},
	});
	const { mutate: addUser, isPending: isAddPending } = useAddUserMutation();

	const onSubmitClick = useCallback(async (formData: z.infer<typeof AddUserFormSchema>) => {
		if (formData) {
			addUser(
				{
					active: true,
					password: formData.password,
					role: formData.role,
					username: formData.username,
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
	}, [addUser, form, onChangesSaved, setIsModalOpen]);

	return <Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
		{/* NOTE - Is this okay to do for the aria describedby? */}
		<DialogContent aria-describedby={undefined}>
			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmitClick)} className="grid gap-4 my-4">
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

								<Suspense fallback={<TextLoadingSkeleton />}>
									<FormControl>
										<Select {...field} onValueChange={(role) => {
											field.onChange(role);
										}}>
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
							<Button type="submit" variant="submit" className="rounded-full" disabled={isAddPending}>
								<Save /> Add User
							</Button>
						</div>
					</DialogFooter>
				</form>
			</Form>
		</DialogContent>
	</Dialog>;
}

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Save } from 'lucide-react';
import { useCallback } from 'react';
import { useAddUserMutation } from '@/features/instance/operations/mutations/addUser';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

export function AddRoleModal({
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
	// const { data: roles } = useSuspenseQuery(getListRolesQueryOptions(instanceId));
	const form = useForm({
		// resolver: zodResolver(AddUserFormSchema),
		defaultValues: {
			role: '',
			superUser: false,
		},
	});
	const { mutate: addUser, isPending: isAddPending } = useAddUserMutation();

	const onSubmitClick = useCallback(
		async (formData) => {
			if (formData) {
				// addRole(
				// 	{
				// 		active: true,
				// 		password: formData.password,
				// 		role: formData.role,
				// 		username: formData.username,
				// 	},
				// 	{
				// 		onSuccess: () => {
				// 			const lastRole = formData.role;
				// 			form.reset();
				// 			// Persist the selected role if they open the form again.
				// 			form.setValue('role', lastRole);
				// 			onChangesSaved();
				// 			toast.success('User added successfully!');
				// 			setIsModalOpen(false);
				// 		},
				// 	}
				// );
			}
		},
		[addUser, form, onChangesSaved, setIsModalOpen]
	);

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			{/* NOTE - Is this okay to do for the aria describedby? */}
			<DialogContent aria-describedby={undefined}>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmitClick)} className="grid gap-4 my-4">
						<DialogHeader>
							<DialogTitle>Add New Role</DialogTitle>
						</DialogHeader>
						<FormField
							control={form.control}
							name="role"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Role</FormLabel>
									<FormControl>
										<Input type="text" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<div className="flex justify-between w-full">
								<Button
									variant="destructiveOutline"
									className="rounded-full"
									onClick={() => setIsModalOpen(false)}
									disabled={isAddPending}
								>
									Cancel
								</Button>
								<Button type="submit" variant="submit" className="rounded-full" disabled={isAddPending}>
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

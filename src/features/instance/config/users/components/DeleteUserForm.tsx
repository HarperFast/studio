import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { DeleteUserFormSchema, useDeleteUserMutation } from '@/features/instance/operations/mutations/deleteUser';
import { LocalUser } from '@/lib/api.patch';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash } from 'lucide-react';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

export function DeleteUserForm({
	data,
	onUserDeleted,
}: {
	data: LocalUser;
	onUserDeleted: () => void;
}) {
	const { mutate: deleteUser, isPending: isDeleteUserPending } = useDeleteUserMutation();
	const deleteForm = useForm<z.infer<typeof DeleteUserFormSchema>>({
		resolver: zodResolver(DeleteUserFormSchema),
		defaultValues: {
			username: data.username,
			confirmUsernameForDeletion: '',
		},
	});

	const onDeleteClicked = useCallback(() => {
		deleteUser(
			{
				username: data.username,
			},
			{

				onSuccess: () => {
					deleteForm.reset();
					toast.success('User deleted successfully!');
					onUserDeleted();
				},
			});
	}, [data.username, deleteForm, deleteUser, onUserDeleted]);

	return <Form {...deleteForm}>
		<form onSubmit={deleteForm.handleSubmit(onDeleteClicked)} className="grid gap-4 my-4">
			<FormField
				control={deleteForm.control}
				name="confirmUsernameForDeletion"
				render={({ field }) => (
					<FormItem>
						<FormLabel className="pb-1">Confirm Username</FormLabel>
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

			<DialogFooter>
				<div className="flex justify-between w-full">
					<Button
						variant="destructive"
						className="rounded-full"
						disabled={isDeleteUserPending || !deleteForm.formState.isValid}
					>
						<Trash /> Delete User
					</Button>
				</div>
			</DialogFooter>
		</form>
	</Form>;
}

import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useInstanceClientParams } from '@/config/useInstanceClient';
import { DeleteUserFormSchema, useDeleteUserMutation } from '@/features/instance/operations/mutations/deleteUser';
import { LocalUser } from '@/lib/api.patch';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash } from 'lucide-react';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

export function DeleteUserForm({
	data,
	onUserDeleted,
}: {
	data: LocalUser;
	onUserDeleted: () => void;
}) {
	const { mutate: deleteUser, isPending: isDeleteUserPending } = useDeleteUserMutation();
	const deleteForm = useForm({
		resolver: zodResolver(DeleteUserFormSchema),
		defaultValues: {
			username: data.username,
			confirmUsernameForDeletion: '',
		},
	});


	const instanceParams = useInstanceClientParams();
	const onDeleteClicked = useCallback(() => {
		deleteUser(
			{
				username: data.username,
				...instanceParams,
			},
			{

				onSuccess: () => {
					deleteForm.reset();
					toast.success('User deleted successfully!');
					onUserDeleted();
				},
			});
	}, [data.username, deleteForm, deleteUser, instanceParams, onUserDeleted]);

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

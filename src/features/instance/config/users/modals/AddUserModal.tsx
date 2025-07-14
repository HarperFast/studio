import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Save } from 'lucide-react';
import { useCallback } from 'react';
import { AddUserFormData, AddUserFormSchema } from '@/features/instance/operations/mutations/addUser';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { notYetImplemented } from '@/lib/notYetImplemented';

export function AddUserModal({
	isAddPending,
	isModalOpen,
	onSaveChanges,
	setIsModalOpen,
}: {
	isAddPending: boolean;
	isModalOpen: boolean;
	onSaveChanges: (data: AddUserFormData) => void;
	setIsModalOpen: (open: boolean) => void;
}) {
	const form = useForm<z.infer<typeof AddUserFormSchema>>({
		resolver: zodResolver(AddUserFormSchema),
		defaultValues: {
			username: '',
			role: '',
			password: '',
			confirmPassword: '',
		},
	});
	const onSubmitClick = useCallback(async (formData: z.infer<typeof AddUserFormSchema>) => {
		// TODO: ...
		console.log(formData, onSaveChanges);
		// if (addTableRecordData) {
		// 	onSaveChanges(JSON.parse(addTableRecordData));
		// }
		notYetImplemented();
	}, [onSaveChanges]);

	return <Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
		{/* NOTE - Is this okay to do for the aria describedby? */}
		<DialogContent aria-describedby={undefined} onEscapeKeyDown={(event) => {
			event.preventDefault();
		}}>
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
								{/*TODO: Role picker*/}
								<FormControl>
									<Input
										type="text"
										placeholder=""
										{...field}
									/>
								</FormControl>
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

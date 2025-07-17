import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
	AddRoleFormData,
	AddRoleFormSchema,
	useAddRoleMutation,
} from '@/features/instance/operations/mutations/addRole';

export function AddRoleModal({
	// instanceId,
	isModalOpen,
	onChangesSaved,
	setIsModalOpen,
}: {
	// instanceId: string;
	isModalOpen: boolean;
	onChangesSaved: () => void;
	setIsModalOpen: (open: boolean) => void;
}) {
	const form = useForm({
		resolver: zodResolver(AddRoleFormSchema),
		defaultValues: {
			role: '',
			super_user: false,
		},
	});
	const { mutate: addRole, isPending: isAddPending } = useAddRoleMutation();

	const onSubmitClick = useCallback(
		async (formData: AddRoleFormData) => {
			if (formData) {
				addRole(
					{
						role: formData.role,
						super_user: formData.super_user,
					},
					{
						onSuccess: () => {
							form.reset();
							onChangesSaved();
							toast.success('Role added successfully!');
							setIsModalOpen(false);
						},
					}
				);
			}
		},
		[addRole, form, onChangesSaved, setIsModalOpen]
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
						<FormField
							control={form.control}
							name="super_user"
							render={({ field }) => (
								<FormItem className="">
									<FormLabel className="">Super User</FormLabel>
									<FormControl>
										<Input
											type="checkbox"
											className="w-6 ml-2"
											checked={field.value}
											onChange={(e) => field.onChange(e.target.checked)}
										/>
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
									<Save /> Add Role
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import {
	AddRoleFormData,
	AddRoleFormSchema,
	useAddRoleMutation,
} from '@/features/instance/operations/mutations/addRole';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

export function AddRoleModal({
	isModalOpen,
	onChangesSaved,
	setIsModalOpen,
}: {
	isModalOpen: boolean;
	onChangesSaved: (roleName: string) => void;
	setIsModalOpen: (open: boolean) => void;
}) {
	const form = useForm({
		resolver: zodResolver(AddRoleFormSchema),
		defaultValues: {
			role: '',
			super_user: false,
			structure_user: false,
		},
	});
	const instanceParams = useInstanceClientIdParams();
	const { mutate: addRole, isPending: isAddPending } = useAddRoleMutation();

	const onSubmitClick = useCallback(
		async (formData: AddRoleFormData) => {
			if (formData) {
				addRole(
					{
						role: formData.role,
						super_user: formData.super_user,
						structure_user: formData.structure_user,
						...instanceParams,
					},
					{
						onSuccess: () => {
							form.reset();
							onChangesSaved(formData.role);
							toast.success('Role added successfully!');
							setIsModalOpen(false);
						},
					},
				);
			}
		},
		[addRole, form, instanceParams, onChangesSaved, setIsModalOpen],
	);

	const onClickCancel = useCallback(() => {
		form.reset();
		setIsModalOpen(false);
	}, [form, setIsModalOpen]);

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			{/* NOTE - Is this okay to do for the aria describedby? */}
			<DialogContent aria-describedby={undefined}>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmitClick)} className="grid gap-4 my-4 md:grid-cols-2">
						<DialogHeader className="md:col-span-2">
							<DialogTitle>Add New Role</DialogTitle>
							<DialogDescription>
								After adding the role, you will be able to edit the per-table permissions.
							</DialogDescription>
						</DialogHeader>
						<FormField
							control={form.control}
							name="role"
							render={({ field }) => (
								<FormItem className="md:col-span-2">
									<FormLabel className="pb-1">Name</FormLabel>
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
								<FormItem className="flex">
									<FormControl>
										<Input
											type="checkbox"
											className="w-6"
											checked={field.value}
											onChange={(e) => field.onChange(e.target.checked)}
										/>
									</FormControl>
									<FormLabel className="pl-4 pr-8 flex-1 py-2.5">Super User</FormLabel>
									<FormMessage />
								</FormItem>)}
						/>
						<FormField
							control={form.control}
							name="structure_user"
							render={({ field }) => (
								<FormItem className="flex">
									<FormControl>
										<Input
											type="checkbox"
											className="w-6"
											checked={field.value}
											onChange={(e) => field.onChange(e.target.checked)}
										/>
									</FormControl>
									<FormLabel className="pl-4 pr-8 flex-1 py-2.5">Structure User</FormLabel>
									<FormMessage />
								</FormItem>)}
						/>

						<DialogFooter className="md:col-span-2">
							<div className="flex justify-between w-full">
								<Button
									variant="destructiveOutline"
									type="button"
									className="rounded-full"
									onClick={onClickCancel}
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

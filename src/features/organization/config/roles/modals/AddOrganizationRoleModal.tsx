import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Editor } from '@monaco-editor/react';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

const defaultPermissions = {
	roles: {
		create: true,
		view: true,
		update: true,
		delete: true,
	},
	clusters: {
		create: true,
		view: true,
		update: true,
		delete: true,
		resources: [],
	},
};

export function AddOrganizationRoleModal({
	isModalOpen,
	onChangesSaved,
	setIsModalOpen,
}: {
	onChangesSaved: () => void;
	isModalOpen: boolean;
	setIsModalOpen: (isOpen: boolean) => void;
}) {
	const [isValidJSON, setIsValidJSON] = useState(true);
	const [updatedPermissions, setUpdatedPermissions] = useState<string>(JSON.stringify(defaultPermissions, null, 2));

	// const form = useForm<z.infer<typeof AddOrgRoleSchema>>({
	const form = useForm({
		// resolver: zodResolver(AddOrgRoleSchema),
		defaultValues: {
			roleName: '',
			updateOrganization: false,
			deleteOrganization: false,
		},
	});

	const onValidate = useCallback(
		(markers: unknown[]) => {
			setIsValidJSON(markers.length === 0);
		},
		[setIsValidJSON]
	);

	const onSubmitRoleEdits = useCallback(
		async (formData) => {
			// async (formData: AddOrgRoleFormData) => {
			if (formData && isValidJSON) {
				//add org role
				console.log('submitRoleEdits called', JSON.parse(updatedPermissions));
			}
		},
		[isValidJSON, updatedPermissions]
	);

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			<DialogContent>
				<DialogTitle>Add New Organization Role</DialogTitle>
				<DialogDescription>Set the new organization role permissions.</DialogDescription>
				<Form {...form}>
					<form className="grid grid-cols-2 gap-4 my-4" onSubmit={form.handleSubmit(onSubmitRoleEdits)}>
						<FormField
							control={form.control}
							name="roleName"
							render={({ field }) => (
								<FormItem className="col-span-2">
									<FormLabel className="pb-1">Role Name</FormLabel>
									<FormControl>
										<Input type="text" placeholder="Developer" className="" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="updateOrganization"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Can Update Organization</FormLabel>
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
						<FormField
							control={form.control}
							name="deleteOrganization"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Can Delete Organization</FormLabel>
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
						<div className="col-span-2">
							<Editor
								theme="vs-dark"
								height="300px"
								defaultLanguage="json"
								onValidate={onValidate}
								onChange={(value) => {
									if (value) {
										setUpdatedPermissions(value);
									}
								}}
								defaultValue={JSON.stringify(defaultPermissions, null, 2)}
							/>
						</div>
						<DialogFooter className="col-span-2">
							<div className="flex justify-between w-full">
								<Button
									variant="destructiveOutline"
									className="rounded-full"
									// onClick={onRoleDeleteClick}
									// disabled={isPending}
								>
									Delete Role
								</Button>
								<Button
									variant="submit"
									className="rounded-full"
									// disabled={isPending || !isValidJSON}
								>
									Save Changes
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

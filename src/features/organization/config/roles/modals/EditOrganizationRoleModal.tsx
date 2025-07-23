import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { OrganizationRole } from '@/lib/api.patch';
import { Editor } from '@monaco-editor/react';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

export function EditOrganizationRoleModal({
	data,
	isModalOpen,
	closeModal,
}: {
	data: OrganizationRole;
	isModalOpen: boolean;
	closeModal: () => void;
}) {
	const { roleName } = data;

	const [isValidJSON, setIsValidJSON] = useState(true);
	const [updatedPermissions, setUpdatedPermissions] = useState<string>();

	// const form = useForm<z.infer<typeof EditOrgRoleSchema>>({
	const form = useForm({
		// resolver: zodResolver(EditOrgRoleSchema),
		defaultValues: {
			roleName: roleName,
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

	const onSubmitRoleEdits = () => {
		if (updatedPermissions && isValidJSON) {
			try {
				// updateRole
				// closeModal();
			} catch (error: unknown) {
				toast.error('Error', {
					description: `Failed to update role: ${error instanceof Error ? error.message : String(error)}.`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			}
		}
	};

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent>
				<DialogTitle>Edit Organization Role "{roleName}"</DialogTitle>
				<DialogDescription>Edit the role's permissions in JSON format or remove the role entirely.</DialogDescription>
				<Form {...form}>
					<form className="grid grid-cols-2 gap-4 my-4" onSubmit={form.handleSubmit(onSubmitRoleEdits)}>
						<FormField
							control={form.control}
							name="roleName"
							render={({ field }) => (
								<FormItem className="col-span-2">
									<FormLabel className="pb-1">Role Name</FormLabel>
									<FormControl>
										<Input type="text" placeholder="Jane" className="" {...field} />
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
								defaultValue={JSON.stringify({}, null, 2)}
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
